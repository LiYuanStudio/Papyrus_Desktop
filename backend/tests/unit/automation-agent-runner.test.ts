import { AutomationAgentRunner } from '../../src/core/automation-agent-runner.js';
import type { Automation } from '../../src/core/automation-types.js';
import type { AIManager } from '../../src/ai/provider.js';
import { jest } from '@jest/globals';

const automation: Automation = {
  id: 'automation-test',
  name: 'Daily summary',
  prompt: 'Summarize the current data',
  schedule: { kind: 'daily', hour: 9, minute: 0 },
  timezone: 'UTC',
  enabled: true,
  allowedTools: ['read_data_stats'],
  modelOverride: null,
  reasoningOverride: null,
  nextRunAt: null,
  lastRunAt: null,
  createdAt: 0,
  updatedAt: 0,
};

describe('AutomationAgentRunner', () => {
  it('feeds an allowed tool result back into a second Agent turn', async () => {
    let turn = 0;
    const manager = {
      standaloneAgentTurn: jest.fn(async () => {
        turn += 1;
        return turn === 1
          ? {
            content: '',
            reasoning: 'Need stats',
            toolCalls: [{ id: 'call-1', name: 'read_data_stats', params: {} }],
            model: 'test-model',
            provider: 'test-provider',
          }
          : {
            content: 'Summary complete',
            reasoning: '',
            toolCalls: [],
            model: 'test-model',
            provider: 'test-provider',
          };
      }),
    };
    const tools = {
      executeTool: jest.fn(() => ({ success: true, cards: 3 })),
    };
    const runner = new AutomationAgentRunner(manager, tools);

    const result = await runner.run(automation);

    expect(result.output).toBe('Summary complete');
    expect(result.reasoning).toContain('Need stats');
    expect(result.toolCalls).toHaveLength(1);
    expect(tools.executeTool).toHaveBeenCalledWith('read_data_stats', {});
    expect(manager.standaloneAgentTurn).toHaveBeenCalledTimes(2);
  });

  it('rejects an automation containing an unknown tool before contacting the model', async () => {
    const manager = { standaloneAgentTurn: jest.fn() };
    const runner = new AutomationAgentRunner(manager, { executeTool: jest.fn() });

    await expect(runner.run({ ...automation, allowedTools: ['unknown_tool'] }))
      .rejects.toThrow('未知工具');
    expect(manager.standaloneAgentTurn).not.toHaveBeenCalled();
  });

  it('rejects a write tool call that is not in the automation whitelist', async () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [{ id: 'write-call', name: 'create_card', params: { question: 'Q', answer: 'A' } }],
        model: 'test-model',
        provider: 'test-provider',
      })),
    };
    const executeTool = jest.fn();
    const runner = new AutomationAgentRunner(manager, { executeTool });

    await expect(runner.run(automation)).rejects.toThrow('未授权工具');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('stops after eight Agent turns without a final answer', async () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: [{ id: 'loop', name: 'read_data_stats', params: {} }],
        model: 'test-model',
        provider: 'test-provider',
      })),
    };
    const runner = new AutomationAgentRunner(manager, {
      executeTool: jest.fn(() => ({ success: true })),
    });

    await expect(runner.run(automation)).rejects.toThrow('回合超过上限 8');
    expect(manager.standaloneAgentTurn).toHaveBeenCalledTimes(8);
  });

  it('stops before executing more than twenty tool calls', async () => {
    const manager = {
      standaloneAgentTurn: jest.fn(async () => ({
        content: '',
        reasoning: '',
        toolCalls: Array.from({ length: 21 }, (_, index) => ({
          id: `call-${index}`,
          name: 'read_data_stats',
          params: {},
        })),
        model: 'test-model',
        provider: 'test-provider',
      })),
    };
    const executeTool = jest.fn(() => ({ success: true }));
    const runner = new AutomationAgentRunner(manager, { executeTool });

    await expect(runner.run(automation)).rejects.toThrow('工具调用超过上限 20');
    expect(executeTool).toHaveBeenCalledTimes(20);
  });

  it('aborts a run after ten minutes', async () => {
    jest.useFakeTimers();
    const manager = {
      standaloneAgentTurn: jest.fn((input: Parameters<AIManager['standaloneAgentTurn']>[0]) => (
        new Promise<never>((_resolve, reject) => {
          input.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
      )),
    };
    const runner = new AutomationAgentRunner(manager, { executeTool: jest.fn() });

    try {
      const run = runner.run(automation);
      const expectedRejection = expect(run).rejects.toThrow('运行超过 10 分钟');
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      await expectedRejection;
    } finally {
      jest.useRealTimers();
    }
  });
});
