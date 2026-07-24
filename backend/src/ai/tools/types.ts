import type { PapyrusLogger } from '../../utils/logger.js';

export type ToolCategory = 'cards' | 'notes' | 'relations' | 'files' | 'data' | 'extensions' | 'settings';
export type ToolSideEffect = 'read' | 'write';

export interface ToolResult {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
}

export interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
        description?: string;
        items?: { type: 'string' | 'integer' | 'number' | 'boolean' };
      }>;
      required?: string[];
    };
  };
}

export interface ParsedAIResponse {
  content: string;
  reasoning: string | null;
  tool_call: ToolCall | null;
}

export interface ToolRunContext {
  logger: PapyrusLogger | null;
}

export type ToolRunner = (params: Record<string, unknown>, ctx: ToolRunContext) => ToolResult;

export interface ToolDescriptor {
  name: string;
  category: ToolCategory;
  sideEffect: ToolSideEffect;
  openai: OpenAIToolDef;
  runner: ToolRunner;
  promptHint?: string;
}

export type ToolRegistry = Record<string, ToolDescriptor>;

export function safeFloat(value: unknown, defaultValue: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

export function safeInt(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return defaultValue;
}

export function requireString(params: Record<string, unknown>, key: string, maxLen?: number): string | { error: string } {
  const value = params[key];
  if (typeof value !== 'string') return { error: `${key} 必须是字符串` };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { error: `${key} 不能为空` };
  if (maxLen !== undefined && trimmed.length > maxLen) return { error: `${key} 长度超过限制 ${maxLen}` };
  return trimmed;
}

export function optionalString(params: Record<string, unknown>, key: string, maxLen?: number): string | undefined | { error: string } {
  if (params[key] === undefined || params[key] === null) return undefined;
  const value = params[key];
  if (typeof value !== 'string') return { error: `${key} 必须是字符串` };
  if (maxLen !== undefined && value.length > maxLen) return { error: `${key} 长度超过限制 ${maxLen}` };
  return value;
}

export function requireId(params: Record<string, unknown>, key: string): string | { error: string } {
  const value = params[key];
  if (typeof value !== 'string') return { error: `${key} 必须是字符串` };
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return { error: `${key} 含非法字符` };
  return value;
}

export function isErr(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && typeof (v as { error?: unknown }).error === 'string';
}
