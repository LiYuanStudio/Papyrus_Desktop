import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('automation repository', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-automations-test-${Date.now()}`);
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  let repository: typeof import('../../src/core/automations.js');

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    const database = await import('../../src/db/database.js');
    closeDb = database.closeDb;
    getDb = database.getDb;
    repository = await import('../../src/core/automations.js');
    getDb();
  });

  afterAll(() => {
    closeDb();
    delete process.env.PAPYRUS_DATA_DIR;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    getDb().exec('DELETE FROM automation_runs; DELETE FROM automations;');
  });

  const create = () => repository.createAutomation({
    name: 'Test automation',
    prompt: 'Summarize due cards',
    schedule: { kind: 'daily', hour: 9, minute: 0 },
    timezone: 'UTC',
    enabled: true,
    allowedTools: ['read_data_stats'],
    providerOverride: null,
    modelOverride: null,
    reasoningOverride: null,
  });

  it('recalculates nextRunAt when paused and resumed', () => {
    const created = create();
    expect(created.nextRunAt).not.toBeNull();

    const paused = repository.updateAutomation(created.id, { enabled: false });
    expect(paused?.nextRunAt).toBeNull();

    const resumed = repository.updateAutomation(created.id, { enabled: true });
    expect(resumed?.nextRunAt).not.toBeNull();
  });

  it('records one missed run and advances the schedule', () => {
    const created = create();
    const past = Date.now() / 1000 - 3600;
    getDb().prepare('UPDATE automations SET next_run_at = ? WHERE id = ?').run(past, created.id);
    const due = repository.getAutomation(created.id);
    if (!due) throw new Error('Expected automation fixture');

    const missed = repository.markAutomationMissed(due, Date.now() / 1000);

    expect(missed?.status).toBe('missed');
    expect(repository.listAutomationRuns(created.id)).toHaveLength(1);
    expect(repository.getAutomation(created.id)?.nextRunAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('atomically claims a queued run only once', () => {
    const created = create();
    const run = repository.createAutomationRun(created.id, 'manual', null);

    expect(repository.claimAutomationRun(run.id)).toBe(true);
    expect(repository.claimAutomationRun(run.id)).toBe(false);
    expect(repository.hasActiveAutomationRun(created.id)).toBe(true);
  });

  it('round-trips every editable field and clears the provider/model pair together', () => {
    const created = repository.createAutomation({
      name: 'Provider-specific automation',
      prompt: 'Use the selected target',
      schedule: { kind: 'weekly', daysOfWeek: [1, 5], hour: 18, minute: 45 },
      timezone: 'Asia/Shanghai',
      enabled: true,
      allowedTools: ['read_data_stats', 'search_cards'],
      providerOverride: 'ollama',
      modelOverride: 'qwen-test',
      reasoningOverride: true,
    });

    expect(repository.getAutomation(created.id)).toEqual(expect.objectContaining({
      name: 'Provider-specific automation',
      prompt: 'Use the selected target',
      schedule: { kind: 'weekly', daysOfWeek: [1, 5], hour: 18, minute: 45 },
      timezone: 'Asia/Shanghai',
      enabled: true,
      allowedTools: ['read_data_stats', 'search_cards'],
      providerOverride: 'ollama',
      modelOverride: 'qwen-test',
      reasoningOverride: true,
    }));

    const updated = repository.updateAutomation(created.id, {
      prompt: 'Use the global target',
      providerOverride: null,
      modelOverride: null,
      reasoningOverride: false,
    });
    expect(updated).toEqual(expect.objectContaining({
      prompt: 'Use the global target',
      providerOverride: null,
      modelOverride: null,
      reasoningOverride: false,
    }));
    expect(updated?.schedule).toEqual(created.schedule);
  });

  it('only finishes claimed runs and persists auditable result metadata', () => {
    const created = create();
    const run = repository.createAutomationRun(created.id, 'manual', null);
    const result = {
      runId: run.id,
      status: 'succeeded' as const,
      output: 'Three cards are due',
      reasoning: 'Read current statistics',
      toolCalls: [{
        name: 'read_data_stats',
        params: {},
        success: true,
        result: { cards: 3 },
      }],
      error: null,
      model: 'qwen-test',
      provider: 'ollama',
    };

    expect(repository.finishAutomationRun(result)).toBe(false);
    expect(repository.claimAutomationRun(run.id)).toBe(true);
    expect(repository.finishAutomationRun(result)).toBe(true);
    expect(repository.getAutomationRun(run.id)).toEqual(expect.objectContaining({
      status: 'succeeded',
      output: 'Three cards are due',
      reasoning: 'Read current statistics',
      toolCalls: result.toolCalls,
      error: null,
      model: 'qwen-test',
      provider: 'ollama',
    }));
  });

  it('enqueues a due schedule once even when the same stale snapshot is retried', () => {
    const created = create();
    const scheduledFor = Date.now() / 1000 - 5;
    getDb().prepare('UPDATE automations SET next_run_at = ? WHERE id = ?')
      .run(scheduledFor, created.id);
    const due = repository.getAutomation(created.id);
    if (!due) throw new Error('Expected due automation fixture');

    const first = repository.enqueueScheduledAutomation(due, Date.now() / 1000);
    const duplicate = repository.enqueueScheduledAutomation(due, Date.now() / 1000);

    expect(first).toEqual(expect.objectContaining({
      automationId: created.id,
      trigger: 'scheduled',
      status: 'queued',
      scheduledFor,
    }));
    expect(duplicate).toBeNull();
    expect(repository.listAutomationRuns(created.id)).toHaveLength(1);
    expect(repository.getAutomation(created.id)?.nextRunAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('fails stale queued and running work without replaying it', () => {
    const firstAutomation = create();
    const secondAutomation = repository.createAutomation({
      name: 'Second automation',
      prompt: 'Read stats',
      schedule: { kind: 'daily', hour: 12, minute: 0 },
      timezone: 'UTC',
      enabled: true,
      allowedTools: ['read_data_stats'],
      providerOverride: null,
      modelOverride: null,
      reasoningOverride: null,
    });
    const running = repository.createAutomationRun(firstAutomation.id, 'manual', null);
    const queued = repository.createAutomationRun(secondAutomation.id, 'manual', null);
    expect(repository.claimAutomationRun(running.id)).toBe(true);

    expect(repository.failStaleAutomationRuns()).toBe(2);
    expect(repository.getAutomationRun(running.id)).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'Papyrus 在运行期间退出，任务未自动重试',
    }));
    expect(repository.getAutomationRun(queued.id)).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'Papyrus 在运行期间退出，任务未自动重试',
    }));
  });

  it('deletes run history through the database foreign-key cascade', () => {
    const created = create();
    const run = repository.createAutomationRun(created.id, 'manual', null);

    expect(repository.deleteAutomation(created.id)).toBe(true);
    expect(repository.getAutomation(created.id)).toBeNull();
    expect(repository.getAutomationRun(run.id)).toBeNull();
  });

  it('isolates a corrupted allowed-tools field instead of failing the full list', () => {
    const created = create();
    getDb().prepare('UPDATE automations SET allowed_tools = ? WHERE id = ?')
      .run('{broken json', created.id);

    expect(repository.getAutomation(created.id)?.allowedTools).toEqual([]);
    expect(repository.listAutomations()).toHaveLength(1);
  });
});

