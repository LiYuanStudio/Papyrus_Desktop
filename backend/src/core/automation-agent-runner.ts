import type { AIManager, ProviderMessage } from '../ai/provider.js';
import { PapyrusTools, TOOL_REGISTRY } from '../ai/tools.js';
import type { ToolResult } from '../ai/tools.js';
import type { Automation, AutomationToolCall } from './automation-types.js';

const MAX_AGENT_TURNS = 8;
const MAX_TOOL_CALLS = 20;
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

export interface AutomationAgentResult {
  output: string;
  reasoning: string;
  toolCalls: AutomationToolCall[];
  model: string;
  provider: string;
}

interface AutomationToolExecutor {
  executeTool(toolName: string, params: Record<string, unknown>): ToolResult;
}

/**
 * 执行自动化专属的有界 Agent 循环。
 * 原因：工具结果需要继续返回模型，直到生成可审核的最终回答。
 * 未复用 HTTP SSE 处理器：后台任务没有响应流且不能污染聊天记录。
 */
export class AutomationAgentRunner {
  private readonly tools: AutomationToolExecutor;

  constructor(
    private readonly aiManager: Pick<AIManager, 'standaloneAgentTurn'>,
    tools?: AutomationToolExecutor,
  ) {
    this.tools = tools ?? new PapyrusTools();
  }

  /**
   * 按自动化白名单执行 Agent，并限制回合、工具次数和总时长。
   * 原因：无人值守任务必须有明确资源与副作用边界。
   * 未修改全局 ToolManager：普通聊天的审批策略不能被后台任务临时覆盖。
   */
  async run(automation: Automation): Promise<AutomationAgentResult> {
    const allowedToolNames = new Set(automation.allowedTools);
    const invalidTool = automation.allowedTools.find((name) => TOOL_REGISTRY[name] === undefined);
    if (invalidTool) {
      throw new Error(`自动化包含未知工具: ${invalidTool}`);
    }

    const messages: ProviderMessage[] = [
      {
        role: 'system',
        content: [
          '你是 Papyrus 的无人值守自动化 Agent。',
          '只执行用户给出的自动化指令，并只调用本次明确授权的工具。',
          '写操作仅在指令明确要求时执行。完成后给出简洁、可审核的结果。',
        ].join('\n'),
      },
      { role: 'user', content: automation.prompt },
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
    const reasoningParts: string[] = [];
    const toolCallRecords: AutomationToolCall[] = [];
    let finalOutput = '';
    let model = automation.modelOverride ?? '';
    let provider = '';
    let toolCallCount = 0;

    try {
      for (let turn = 0; turn < MAX_AGENT_TURNS; turn += 1) {
        const result = await this.aiManager.standaloneAgentTurn({
          messages,
          allowedToolNames,
          overrideProvider: automation.providerOverride ?? undefined,
          overrideModel: automation.modelOverride ?? undefined,
          reasoning: automation.reasoningOverride ?? undefined,
          signal: controller.signal,
        });
        model = result.model;
        provider = result.provider;
        if (result.reasoning) reasoningParts.push(result.reasoning);
        if (result.content) finalOutput = result.content;

        if (result.toolCalls.length === 0) {
          return {
            output: finalOutput,
            reasoning: reasoningParts.join('\n\n'),
            toolCalls: toolCallRecords,
            model,
            provider,
          };
        }

        messages.push({
          role: 'assistant',
          content: result.content,
          tool_calls: result.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.params) },
          })),
        });

        for (const call of result.toolCalls) {
          toolCallCount += 1;
          if (toolCallCount > MAX_TOOL_CALLS) {
            throw new Error(`自动化工具调用超过上限 ${MAX_TOOL_CALLS}`);
          }
          if (!allowedToolNames.has(call.name) || TOOL_REGISTRY[call.name] === undefined) {
            throw new Error(`Agent 尝试调用未授权工具: ${call.name}`);
          }
          const toolResult = this.tools.executeTool(call.name, call.params);
          const success = toolResult.success !== false;
          const record: AutomationToolCall = {
            name: call.name,
            params: call.params,
            success,
            ...(success
              ? { result: toolResult as Record<string, unknown> }
              : { error: String(toolResult.error ?? '工具执行失败') }),
          };
          toolCallRecords.push(record);
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: call.id,
            name: call.name,
          });
        }
      }
      throw new Error(`自动化 Agent 回合超过上限 ${MAX_AGENT_TURNS}`);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('自动化运行超过 10 分钟，已停止');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
