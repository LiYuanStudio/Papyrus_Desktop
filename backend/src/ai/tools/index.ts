import type { PapyrusLogger } from '../../utils/logger.js';
import { TOOL_REGISTRY, TOOL_LIST, PROMPT_HINTS } from './registry.js';
import { AIResponseParser } from './parser.js';
import type { OpenAIToolDef, ToolCall, ToolResult, ToolDescriptor } from './types.js';

export type { ToolResult, ToolCall, OpenAIToolDef, ParsedAIResponse, ToolDescriptor, ToolCategory, ToolSideEffect } from './types.js';
export { AIResponseParser } from './parser.js';
export { TOOL_REGISTRY, TOOL_LIST, PROMPT_HINTS } from './registry.js';

export interface ToolCatalogEntry {
  name: string;
  category: string;
  side_effect: 'read' | 'write';
  description: string;
}

export class PapyrusTools {
  private logger: PapyrusLogger | null;

  constructor(logger?: PapyrusLogger) {
    this.logger = logger ?? null;
  }

  private logEvent(eventType: string, data: unknown = null, level = 'INFO'): void {
    this.logger?.logEvent(eventType, data, level);
  }

  getToolsForOpenAI(): OpenAIToolDef[] {
    return TOOL_LIST.map(d => d.openai);
  }

  getToolsDefinition(): string {
    const sections: string[] = [];
    for (const [, hint] of Object.entries(PROMPT_HINTS)) {
      sections.push(hint);
    }
    return `你可以使用以下分类工具：

${sections.join('\n\n')}

调用格式：
\`\`\`json
{"tool": "工具名", "params": {...}}
\`\`\`

注意：写操作需要用户审批后才会执行。`;
  }

  getCatalog(): ToolCatalogEntry[] {
    return TOOL_LIST.map(d => ({
      name: d.name,
      category: d.category,
      side_effect: d.sideEffect,
      description: d.openai.function.description,
    }));
  }

  hasTool(toolName: string): boolean {
    return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolName);
  }

  getDescriptor(toolName: string): ToolDescriptor | null {
    return TOOL_REGISTRY[toolName] ?? null;
  }

  executeTool(toolName: string, params: Record<string, unknown>): ToolResult {
    const desc = TOOL_REGISTRY[toolName];
    if (!desc) {
      this.logEvent('tool.unknown', { tool: toolName }, 'WARNING');
      return { success: false, error: `未知工具: ${toolName}` };
    }
    this.logEvent('tool.execute_start', { tool: toolName, params });
    const start = Date.now();
    try {
      const result = desc.runner(params, { logger: this.logger });
      const elapsed = (Date.now() - start) / 1000;
      this.logEvent('tool.execute_ok', {
        tool: toolName,
        elapsed_s: elapsed,
        result_type: result.success ? 'success' : 'error',
      });
      return result;
    } catch (exc) {
      const elapsed = (Date.now() - start) / 1000;
      this.logEvent(
        'tool.execute_error',
        { tool: toolName, elapsed_s: elapsed, error: exc instanceof Error ? exc.message : String(exc) },
        'ERROR',
      );
      return { success: false, error: exc instanceof Error ? exc.message : String(exc) };
    }
  }

  parseToolCall(aiResponse: string): ToolCall | null {
    return AIResponseParser.parseToolCall(aiResponse);
  }
}


