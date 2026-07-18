import type { ToolCallRecord } from '../../ai/tool-manager.js';

export interface AIConfigPayload {
  current_provider?: string;
  current_model?: string;
  title_provider?: string;
  title_model?: string;
  translation_provider?: string;
  translation_model?: string;
  providers?: Record<string, { api_key: string; base_url: string; models: string[] }>;
  parameters?: { temperature?: number; top_p?: number; max_tokens?: number; presence_penalty?: number; frequency_penalty?: number };
  features?: { auto_hint?: boolean; auto_explain?: boolean; context_length?: number; agent_enabled?: boolean; cache_enabled?: boolean };
}

export interface CompletionPayload {
  prefix: string;
  context?: string;
  max_tokens?: number;
}

export interface ToolConfigPayload {
  mode: string;
  auto_execute_tools: string[];
}

export interface ParsePayload {
  response: string;
  reasoning_content?: string | null;
}

export interface PendingToolCallTracker {
  name: string;
  args: string;
  parsedArgs: Record<string, unknown>;
  id: string;
  callId: string | undefined;
}

export interface ChatStreamReply {
  raw: { write: (chunk: string) => void; end: () => void };
}

export function isKeylessProvider(name: string): boolean {
  return (
    name === 'ollama' ||
    name === 'lm-studio' ||
    name === 'localai' ||
    name === 'tabbyapi' ||
    name === 'koboldcpp' ||
    name === 'text-generation-webui' ||
    name === 'llamacpp'
  );
}

export function convertCallToResponse(call: ToolCallRecord): Record<string, unknown> {
  return {
    call_id: call.call_id,
    tool_name: call.tool_name,
    params: call.params,
    status: call.status,
    result: call.result,
    created_at: call.created_at,
    executed_at: call.executed_at,
    error: call.error,
  };
}
