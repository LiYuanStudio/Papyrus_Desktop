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
});

