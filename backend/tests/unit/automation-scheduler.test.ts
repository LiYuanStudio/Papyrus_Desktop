import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import type { Automation } from '../../src/core/automation-types.js';

describe('AutomationScheduler', () => {
  const testDir = path.join(os.tmpdir(), 'papyrus-automation-scheduler-' + Date.now());
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  let repository: typeof import('../../src/core/automations.js');
  let Scheduler: typeof import('../../src/core/automation-scheduler.js').AutomationScheduler;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    const database = await import('../../src/db/database.js');
    const schedulerModule = await import('../../src/core/automation-scheduler.js');
    closeDb = database.closeDb;
    getDb = database.getDb;
    repository = await import('../../src/core/automations.js');
    Scheduler = schedulerModule.AutomationScheduler;
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

  /**
   * 创建使用真实仓储的调度器测试任务。
   * 原因：各用例只替换外部 Agent 边界，队列、状态机和持久化必须使用生产实现。
   * 未共享返回对象：每个任务需要独立 ID 才能验证全局串行行为。
   */
  function createAutomation(name: string): Automation {
    return repository.createAutomation({
      name,
      prompt: 'Read current statistics',
      schedule: { kind: 'daily', hour: 9, minute: 0 },
      timezone: 'UTC',
      enabled: true,
      allowedTools: ['read_data_stats'],
      providerOverride: 'ollama',
      modelOverride: 'scheduler-model',
      reasoningOverride: null,
    });
  }

  /**
   * 等待异步 Worker 把运行写入终态。
   * 原因：enqueueManual 设计为立即返回 202 语义，测试不能假设 void Promise 已完成。
   * 未使用固定长延时：逐微任务轮询让测试快速且减少慢机器波动。
   */
  async function waitForTerminal(runId: string): Promise<ReturnType<typeof repository.getAutomationRun>> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const run = repository.getAutomationRun(runId);
      if (run && ['succeeded', 'failed'].includes(run.status)) return run;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('Scheduler run did not reach a terminal state');
  }

  it('persists a successful manual run through the real queue and database', async () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [],
        model: 'unused',
        provider: 'unused',
      })),
    };
    const runner = {
      run: jest.fn(async (automation: Automation) => ({
        output: 'Scheduler completed',
        reasoning: 'Used the injected boundary',
        toolCalls: [],
        model: automation.modelOverride ?? '',
        provider: automation.providerOverride ?? '',
      })),
    };
    const scheduler = new Scheduler(manager, undefined, runner);
    const automation = createAutomation('Manual success');

    const queued = scheduler.enqueueManual(automation.id);
    if (!queued) throw new Error('Expected a queued manual run');
    const terminal = await waitForTerminal(queued.id);

    expect(runner.run).toHaveBeenCalledWith(expect.objectContaining({ id: automation.id }));
    expect(terminal).toEqual(expect.objectContaining({
      status: 'succeeded',
      output: 'Scheduler completed',
      reasoning: 'Used the injected boundary',
      model: 'scheduler-model',
      provider: 'ollama',
    }));
    expect(repository.getAutomation(automation.id)?.lastRunAt).not.toBeNull();
  });

  it('keeps different automations globally serial and rejects same-task overlap', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const runner = {
      run: jest.fn(async (automation: Automation) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        if (automation.name === 'First serial task') await firstGate;
        active -= 1;
        return {
          output: automation.name,
          reasoning: '',
          toolCalls: [],
          model: 'scheduler-model',
          provider: 'ollama',
        };
      }),
    };
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [],
        model: 'unused',
        provider: 'unused',
      })),
    };
    const scheduler = new Scheduler(manager, undefined, runner);
    const first = createAutomation('First serial task');
    const second = createAutomation('Second serial task');

    const firstRun = scheduler.enqueueManual(first.id);
    if (!firstRun) throw new Error('Expected first run');
    expect(scheduler.enqueueManual(first.id)).toBeNull();
    const secondRun = scheduler.enqueueManual(second.id);
    if (!secondRun) throw new Error('Expected second run');
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(repository.getAutomationRun(firstRun.id)?.status).toBe('running');
    expect(repository.getAutomationRun(secondRun.id)?.status).toBe('queued');
    releaseFirst?.();
    await Promise.all([waitForTerminal(firstRun.id), waitForTerminal(secondRun.id)]);

    expect(maximumActive).toBe(1);
    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it('records runner failures instead of leaving work active', async () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [],
        model: 'unused',
        provider: 'unused',
      })),
    };
    const runner = {
      run: jest.fn(async () => {
        throw new Error('provider offline');
      }),
    };
    const scheduler = new Scheduler(manager, undefined, runner);
    const automation = createAutomation('Failure state');

    const queued = scheduler.enqueueManual(automation.id);
    if (!queued) throw new Error('Expected failure run');
    const terminal = await waitForTerminal(queued.id);

    expect(terminal).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'provider offline',
      model: 'scheduler-model',
      provider: 'ollama',
    }));
    expect(repository.hasActiveAutomationRun(automation.id)).toBe(false);
  });

  it('recovers stale work and records one missed occurrence on startup', () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [],
        model: 'unused',
        provider: 'unused',
      })),
    };
    const runner = { run: jest.fn(async () => {
      throw new Error('Missed work must not be replayed');
    }) };
    const scheduler = new Scheduler(manager, undefined, runner);
    const automation = createAutomation('Startup recovery');
    const stale = repository.createAutomationRun(automation.id, 'manual', null);
    getDb().prepare('UPDATE automations SET next_run_at = ? WHERE id = ?')
      .run(Date.now() / 1000 - 60, automation.id);

    scheduler.start();
    scheduler.stop();

    expect(repository.getAutomationRun(stale.id)).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'Papyrus 在运行期间退出，任务未自动重试',
    }));
    const runs = repository.listAutomationRuns(automation.id);
    expect(runs.filter((run) => run.status === 'missed')).toHaveLength(1);
    expect(runner.run).not.toHaveBeenCalled();
    expect(repository.getAutomation(automation.id)?.nextRunAt).toBeGreaterThan(Date.now() / 1000);
  });
});