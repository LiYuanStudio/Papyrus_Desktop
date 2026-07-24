export interface CardRecord {
  id: string;
  q: string;
  a: string;
  next_review: number;
  interval: number;
  ef: number;
  repetitions: number;
  tags: string[];
}

export interface Note {
  id: string;
  title: string;
  folder: string;
  content: string;
  preview: string;
  tags: string[];
  created_at: number;
  updated_at: number;
  word_count: number;
  hash: string;
  headings: Array<{ level: number; text: string }>;
  outgoing_links: string[];
  incoming_count: number;
}

export interface FileRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  mime_type: string;
  parent_id: string | null;
  file_storage_path: string | null;
  is_folder: number;
  created_at: number;
  updated_at: number;
}

export interface Provider {
  id: string;
  type: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  isDefault: boolean;
  apiKeys: ApiKey[];
  models: Model[];
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  /** 读接口脱敏时标记是否已保存密钥（key 字段为掩码或空） */
  hasKey?: boolean;
}

export interface Model {
  id: string;
  name: string;
  modelId: string;
  port: string;
  capabilities: string[];
  apiKeyId: string | null;
  enabled: boolean;
}

export type ChatBlockType = 'text' | 'reasoning' | 'tool_call' | 'tool_result';

export interface ChatBlock {
  type: ChatBlockType;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  toolStatus?: 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'failed';
  toolParams?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  stored_name: string;
  path: string;
  type: 'image' | 'document';
  mime_type: string;
  size: number;
  created_at: number;
}

export interface ChatTokenUsage {
  prompt?: number;
  completion?: number;
  total?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  isActive: boolean;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  blocks: ChatBlock[];
  attachments: ChatAttachment[];
  model: string;
  provider: string;
  tokenUsage: ChatTokenUsage;
  parentMessageId: string | null;
  createdAt: number;
}
