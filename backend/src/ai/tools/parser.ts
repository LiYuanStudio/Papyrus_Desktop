import type { ParsedAIResponse, ToolCall } from './types.js';

export class AIResponseParser {
  private static readonly REASONING_TAGS: Array<[RegExp, string]> = [
    [/<think>(.*?)<\/think>/gs, 'think'],
    [/<reasoning>(.*?)<\/reasoning>/gs, 'reasoning'],
    [/<thought>(.*?)<\/thought>/gs, 'thought'],
  ];

  private static readonly TOOL_CALL_PATTERNS = [
    /```json\s*(\{.*?\})\s*```/gs,
    /```\s*(\{[^{}]*"tool"[^{}]*\})\s*```/gs,
  ];

  static parseReasoning(content: string): { cleaned: string; reasoning: string | null } {
    const reasoningParts: string[] = [];
    let cleanedContent = content;

    for (const [pattern] of this.REASONING_TAGS) {
      const matches = [...content.matchAll(pattern)];
      if (matches.length > 0) {
        for (const match of matches) {
          const text = match[1];
          if (text) reasoningParts.push(text.trim());
        }
        cleanedContent = cleanedContent.replace(pattern, '');
      }
    }

    cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n').trim();
    const reasoning = reasoningParts.length > 0 ? reasoningParts.join('\n\n') : null;
    return { cleaned: cleanedContent, reasoning };
  }

  static parseToolCall(content: string): ToolCall | null {
    for (const pattern of this.TOOL_CALL_PATTERNS) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches) {
        try {
          const text = match[1];
          if (!text) continue;
          const obj = JSON.parse(text) as unknown;
          if (
            obj !== null &&
            typeof obj === 'object' &&
            typeof (obj as Record<string, unknown>).tool === 'string' &&
            typeof (obj as Record<string, unknown>).params === 'object'
          ) {
            return {
              tool: (obj as Record<string, unknown>).tool as string,
              params: (obj as Record<string, unknown>).params as Record<string, unknown>,
            };
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  static parseResponse(response: string, reasoningContent?: string | null): ParsedAIResponse {
    const { cleaned, reasoning } = this.parseReasoning(response);
    const finalReasoning = reasoningContent && !reasoning ? reasoningContent : reasoning;
    const toolCall = this.parseToolCall(cleaned) ?? this.parseToolCall(response);
    const contentWithoutTools = this.removeToolCallMarkers(cleaned);

    return {
      content: contentWithoutTools,
      reasoning: finalReasoning,
      tool_call: toolCall,
    };
  }

  static removeToolCallMarkers(content: string): string {
    let cleaned = content;
    for (const pattern of this.TOOL_CALL_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    cleaned = cleaned.replace(/\n{2,}/g, '\n').trim();
    return cleaned;
  }
}

export const parseToolCall = AIResponseParser.parseToolCall;
export const parseReasoning = AIResponseParser.parseReasoning;
export const parseResponse = AIResponseParser.parseResponse;
