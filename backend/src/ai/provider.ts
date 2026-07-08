import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import OpenAI from 'openai';
import type { Fetch } from 'openai/core';
import type { AIConfig } from './config.js';
import { isPrivateUrl } from './config.js';
import { LLMCache } from './llm-cache.js';
import { getProviderConfigFromDB } from './db-sync.js';
import { getClientId } from '../utils/client-id.js';
import { fetchWithProxy } from '../utils/proxy.js';
import { PapyrusTools } from './tools.js';
import type { OpenAIToolDef } from './tools.js';
import {
  createChatSession as repoCreateChatSession,
  listChatSessions as repoListChatSessions,
  getChatSession as repoGetChatSession,
  updateChatSession as repoUpdateChatSession,
  setActiveChatSession as repoSetActiveChatSession,
  getActiveChatSession as repoGetActiveChatSession,
  deleteChatSession as repoDeleteChatSession,
  clearAllChatSessions as repoClearAllChatSessions,
  appendChatMessage as repoAppendChatMessage,
  listChatMessages as repoListChatMessages,
  getChatMessage as repoGetChatMessage,
  softDeleteChatMessage as repoSoftDeleteChatMessage,
  deleteMessagesAfter as repoDeleteMessagesAfter,
  updateChatMessage as repoUpdateChatMessage,
} from '../db/database.js';
import type { ChatSessionRow, ChatMessageRow } from '../db/database.js';
import type { ChatBlock, ChatSession, ChatMessage, ChatAttachment, ChatTokenUsage } from '../core/types.js';

export type StreamEventType =
  | 'content'
  | 'reasoning'
  | 'tool_start'
  | 'tool_result'
  | 'done'
  | 'error'
  | 'user_saved'
  | 'stream_end';

export interface StreamChunk {
  type: StreamEventType;
  data: string | Record<string, unknown>;
}

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'very_high';
export type ReasoningKind = false | 'reasoning_effort' | 'thinking' | 'thinking_config';
export type ProviderModality = 'openai-compat' | 'ollama' | 'text-only';

interface ProviderMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
  images?: string[];
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

type RequestParamsWithReasoning = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  thinking?: { type: 'enabled'; budget_tokens: number };
  thinking_config?: { thinking_budget: number };
};

const REASONING_BUDGET: Record<ReasoningEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 8192,
  very_high: 32768,
};

export function getProviderModality(providerName: string): ProviderModality {
  if (providerName === 'ollama') return 'ollama';
  const compat = new Set([
    'openai',
    'anthropic',
    'gemini',
    'deepseek',
    'moonshot',
    'siliconflow',
    'custom',
  ]);
  if (compat.has(providerName)) return 'openai-compat';
  return 'text-only';
}

export function modelSupportsReasoning(providerName: string, model: string): ReasoningKind {
  const lower = model.toLowerCase();
  if (
    providerName === 'openai' ||
    providerName === 'deepseek' ||
    providerName === 'moonshot' ||
    providerName === 'siliconflow'
  ) {
    if (/^o[1-9]|^gpt-5|r1|reasoner|thinking/i.test(lower)) return 'reasoning_effort';
    return false;
  }
  if (providerName === 'anthropic') {
    if (/claude-(opus|sonnet)-[4-9]|claude-mythos/i.test(lower)) return 'thinking';
    return false;
  }
  if (providerName === 'gemini') {
    if (/gemini-[2-9]\.\d|gemini-[3-9]/i.test(lower)) return 'thinking_config';
    return false;
  }
  return false;
}

function normalizeReasoning(reasoning: unknown): ReasoningEffort | false {
  if (typeof reasoning === 'boolean') return reasoning ? 'medium' : false;
  if (typeof reasoning === 'string') {
    const s = reasoning.trim().toLowerCase();
    if (s === 'low' || s === 'medium' || s === 'high' || s === 'very_high') return s;
    if (s === 'true') return 'medium';
    return false;
  }
  return false;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  stored_name: string;
  path: string;
  type: 'image' | 'document';
  mime_type: string;
  size: number;
  created_at: number;
}

interface BackendHistoryMessage {
  role: string;
  content: string;
  attachments: AttachmentMeta[];
  blocks: import('../core/types.js').ChatBlock[];
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.docx']);
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

function rowToChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    provider: row.provider,
    isActive: row.is_active === 1,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeParseJsonArray<T>(text: string): T[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as T[];
  } catch {
    // ignore
  }
  return [];
}

function safeParseJsonObject<T>(text: string): T | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    // ignore
  }
  return null;
}

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    blocks: safeParseJsonArray<ChatBlock>(row.blocks),
    attachments: safeParseJsonArray<ChatAttachment>(row.attachments),
    model: row.model,
    provider: row.provider,
    tokenUsage: safeParseJsonObject<ChatTokenUsage>(row.token_usage) ?? {},
    parentMessageId: row.parent_message_id,
    createdAt: row.created_at,
  };
}

function rowToHistoryMessage(row: ChatMessageRow): BackendHistoryMessage {
  return {
    role: row.role,
    content: row.content,
    attachments: safeParseJsonArray<AttachmentMeta>(row.attachments),
    blocks: safeParseJsonArray<import('../core/types.js').ChatBlock>(row.blocks),
  };
}

export class AIManager {
  config: AIConfig;
  dataDir: string;
  conversationsDir: string;
  uploadsDir: string;
  legacySessionsFile: string;
  llmCache: LLMCache;
  private saveMutex = new Mutex();

  constructor(config: AIConfig) {
    this.config = config;
    this.dataDir = path.dirname(config.configFile);
    this.conversationsDir = path.join(this.dataDir, 'conversations');
    this.uploadsDir = path.join(this.dataDir, 'uploads');
    this.legacySessionsFile = path.join(this.conversationsDir, 'sessions.json');
    this.llmCache = new LLMCache(path.join(this.dataDir, 'llm_cache'), {
      enabled: config.config.features.cache_enabled,
    });

    fs.mkdirSync(this.conversationsDir, { recursive: true });
    fs.mkdirSync(this.uploadsDir, { recursive: true });

    this.migrateLegacySessionsJson();

    if (repoListChatSessions().length === 0) {
      const fresh = repoCreateChatSession({ id: this.generateSessionId(), title: '新对话' });
      repoSetActiveChatSession(fresh.id);
    } else if (!repoGetActiveChatSession()) {
      const list = repoListChatSessions();
      if (list.length > 0) repoSetActiveChatSession(list[0]!.id);
    }
  }

  private generateSessionId(): string {
    return uuidv4().replace(/-/g, '').slice(0, 12);
  }

  private migrateLegacySessionsJson(): void {
    if (!fs.existsSync(this.legacySessionsFile)) return;
    if (repoListChatSessions().length > 0) {
      try {
        fs.renameSync(this.legacySessionsFile, this.legacySessionsFile + '.bak');
      } catch {
        // ignore
      }
      return;
    }
    try {
      const content = fs.readFileSync(this.legacySessionsFile, 'utf8');
      const data = JSON.parse(content) as unknown;
      if (data === null || typeof data !== 'object') return;
      const dict = data as Record<string, unknown>;
      const sessions = Array.isArray(dict.sessions) ? dict.sessions : [];
      const activeId = dict.active_session_id !== undefined ? String(dict.active_session_id) : null;
      let imported = 0;
      for (const sessionRaw of sessions) {
        if (sessionRaw === null || typeof sessionRaw !== 'object') continue;
        const s = sessionRaw as Record<string, unknown>;
        const sid = s.id !== undefined ? String(s.id) : '';
        if (!sid) continue;
        const createdAt = typeof s.created_at === 'number' ? s.created_at : Date.now() / 1000;
        const updatedAt = typeof s.updated_at === 'number' ? s.updated_at : createdAt;
        repoCreateChatSession({
          id: sid,
          title: s.title !== undefined ? String(s.title) : '新对话',
          created_at: createdAt,
          updated_at: updatedAt,
        });
        const messages = Array.isArray(s.messages) ? s.messages : [];
        let parentId: string | null = null;
        for (const msgRaw of messages) {
          if (msgRaw === null || typeof msgRaw !== 'object') continue;
          const m = msgRaw as Record<string, unknown>;
          const role = String(m.role ?? 'user');
          if (role !== 'user' && role !== 'assistant' && role !== 'system' && role !== 'tool') continue;
          const messageContent = String(m.content ?? '');
          const attachmentsRaw = Array.isArray(m.attachments) ? m.attachments : [];
          const inserted = repoAppendChatMessage({
            session_id: sid,
            role,
            content: messageContent,
            blocks: JSON.stringify(messageContent ? ([{ type: 'text', text: messageContent }] as ChatBlock[]) : []),
            attachments: JSON.stringify(attachmentsRaw),
            parent_message_id: role === 'assistant' ? parentId : null,
            created_at: updatedAt,
          });
          parentId = inserted.id;
        }
        imported += 1;
      }
      if (activeId && repoGetChatSession(activeId)) {
        repoSetActiveChatSession(activeId);
      }
      fs.renameSync(this.legacySessionsFile, this.legacySessionsFile + '.bak');
      console.info(`[AIManager] 已从 sessions.json 迁移 ${imported} 个会话到数据库`);
    } catch (e) {
      console.error('[AIManager] sessions.json 迁移失败，原文件保留:', e instanceof Error ? e.message : String(e));
    }
  }

  // ==================== Sessions ====================

  listSessions(): ChatSession[] {
    return repoListChatSessions().map(rowToChatSession);
  }

  createSession(title?: string, switchSession = true): ChatSession {
    const generatedTitle = (title && title.trim()) || new Date().toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).replace(/\//g, '-');
    const row = repoCreateChatSession({ id: this.generateSessionId(), title: generatedTitle });
    if (switchSession) {
      repoSetActiveChatSession(row.id);
      const refreshed = repoGetChatSession(row.id);
      if (refreshed) return rowToChatSession(refreshed);
    }
    return rowToChatSession(row);
  }

  switchSession(sessionId: string): ChatSession {
    const ok = repoSetActiveChatSession(sessionId);
    if (!ok) throw new Error('会话不存在');
    const row = repoGetChatSession(sessionId);
    if (!row) throw new Error('会话不存在');
    return rowToChatSession(row);
  }

  renameSession(sessionId: string, title: string): ChatSession {
    const trimmed = title.trim() || '新对话';
    const ok = repoUpdateChatSession(sessionId, { title: trimmed });
    if (!ok) throw new Error('会话不存在');
    const row = repoGetChatSession(sessionId);
    if (!row) throw new Error('会话不存在');
    return rowToChatSession(row);
  }

  deleteSession(sessionId: string): { activeSessionId: string | null } {
    const result = repoDeleteChatSession(sessionId);
    if (!result.deleted) throw new Error('会话不存在');
    if (result.newActiveId === null && repoListChatSessions().length === 0) {
      const fresh = this.createSession('新对话', true);
      return { activeSessionId: fresh.id };
    }
    return { activeSessionId: result.newActiveId };
  }

  clearAllSessions(): { activeSessionId: string | null; deletedCount: number } {
    const deleted = repoClearAllChatSessions();
    const fresh = this.createSession('新对话', true);
    return { activeSessionId: fresh.id, deletedCount: deleted };
  }

  reset(): void {
    this.clearAllSessions();
  }

  getActiveSessionId(): string | null {
    return repoGetActiveChatSession()?.id ?? null;
  }

  getActiveSession(): ChatSession | null {
    const row = repoGetActiveChatSession();
    return row ? rowToChatSession(row) : null;
  }

  getActiveSessionTitle(): string {
    return repoGetActiveChatSession()?.title ?? '';
  }

  getSession(sessionId: string): ChatSession | null {
    const row = repoGetChatSession(sessionId);
    return row ? rowToChatSession(row) : null;
  }

  listMessages(sessionId: string): ChatMessage[] {
    return repoListChatMessages(sessionId).map(rowToChatMessage);
  }

  getMessage(messageId: string): ChatMessage | null {
    const row = repoGetChatMessage(messageId);
    return row ? rowToChatMessage(row) : null;
  }

  deleteMessage(messageId: string): boolean {
    return repoSoftDeleteChatMessage(messageId);
  }

  updateMessage(messageId: string, patch: { content: string }): boolean {
    const row = repoGetChatMessage(messageId);
    if (!row) {
      return false;
    }
    const blocks = JSON.stringify([{ type: 'text', text: patch.content }] as ChatBlock[]);
    return repoUpdateChatMessage(messageId, { content: patch.content, blocks });
  }

  prepareRegenerate(messageId: string): {
    sessionId: string;
    userMessage: string;
    userAttachments: AttachmentMeta[];
    parentMessageId: string | null;
  } | null {
    const target = repoGetChatMessage(messageId);
    if (!target || target.role !== 'assistant') return null;
    let userMessage = '';
    let userAttachments: AttachmentMeta[] = [];
    if (target.parent_message_id) {
      const userRow = repoGetChatMessage(target.parent_message_id);
      if (userRow) {
        userMessage = userRow.content;
        userAttachments = safeParseJsonArray<AttachmentMeta>(userRow.attachments);
      }
    }
    repoDeleteMessagesAfter(target.session_id, target.created_at);
    return {
      sessionId: target.session_id,
      userMessage,
      userAttachments,
      parentMessageId: target.parent_message_id,
    };
  }

  clearHistory(): void {
    const fresh = this.createSession('新对话', true);
    void fresh;
  }

  // ==================== Persistence helpers ====================

  async persistUserMessage(
    sessionId: string,
    userMessage: string,
    attachments: AttachmentMeta[],
  ): Promise<string> {
    return await this.saveMutex.runExclusive(() => {
      const row = repoAppendChatMessage({
        session_id: sessionId,
        role: 'user',
        content: userMessage,
        blocks: JSON.stringify([{ type: 'text', text: userMessage }] as ChatBlock[]),
        attachments: JSON.stringify(attachments),
        parent_message_id: null,
      });
      return row.id;
    });
  }

  async persistAssistantMessage(input: {
    sessionId: string;
    content: string;
    blocks: ChatBlock[];
    model: string;
    provider: string;
    parentMessageId: string | null;
    tokenUsage?: ChatTokenUsage;
  }): Promise<string> {
    return await this.saveMutex.runExclusive(() => {
      const row = repoAppendChatMessage({
        session_id: input.sessionId,
        role: 'assistant',
        content: input.content,
        blocks: JSON.stringify(input.blocks),
        model: input.model,
        provider: input.provider,
        token_usage: JSON.stringify(input.tokenUsage ?? {}),
        parent_message_id: input.parentMessageId,
      });
      return row.id;
    });
  }

  // ==================== Attachment helpers ====================

  private validateAttachments(attachments: Array<{ path?: string } | string> | null | undefined): string[] {
    if (!attachments) return [];
    if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new Error(`单次最多上传 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`);
    }
    const normalized: string[] = [];
    for (const item of attachments) {
      const itemPath = typeof item === 'string' ? item : (item.path ?? '');
      if (!itemPath) continue;

      // Reject path traversal attempts
      if (itemPath.includes('..') || itemPath.includes('\x00')) {
        throw new Error(`非法文件路径: ${itemPath}`);
      }

      let resolvedPath = itemPath;
      if (!fs.existsSync(itemPath)) {
        const vaultDir = path.join(this.dataDir, 'vault');
        if (fs.existsSync(vaultDir)) {
          // Use basename matching to avoid partial path issues
          const files = fs.readdirSync(vaultDir);
          const safeItem = path.basename(itemPath);
          const matched = files.find((f) => f.startsWith(safeItem + '_'));
          if (matched) {
            resolvedPath = path.join(vaultDir, matched);
          }
        }
      }

      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`文件不存在: ${itemPath}`);
      }
      const resolved = path.resolve(resolvedPath);
      const dataDir = path.resolve(this.dataDir);
      // Always enforce path containment for attachments
      if (!resolved.startsWith(dataDir + path.sep) && resolved !== dataDir) {
        throw new Error('附件必须位于 Papyrus 工作区内');
      }
      const ext = path.extname(resolvedPath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext) && !DOCUMENT_EXTENSIONS.has(ext)) {
        throw new Error(`不支持的文件类型: ${path.basename(resolvedPath)}`);
      }
      const size = fs.statSync(resolvedPath).size;
      if (size > MAX_ATTACHMENT_SIZE) {
        throw new Error(`文件超过大小限制(10MB): ${path.basename(resolvedPath)}`);
      }
      normalized.push(resolvedPath);
    }
    return normalized;
  }

  private storeAttachments(
    attachments: Array<{ path?: string } | string> | null | undefined,
    sessionId: string,
  ): AttachmentMeta[] {
    const paths = this.validateAttachments(attachments);
    if (!paths.length) return [];

    const sessionUploadDir = path.join(this.uploadsDir, sessionId);
    fs.mkdirSync(sessionUploadDir, { recursive: true });

    const stored: AttachmentMeta[] = [];
    for (const filePath of paths) {
      const ext = path.extname(filePath).toLowerCase();
      const fileId = uuidv4().replace(/-/g, '');
      const storedName = `${fileId}${ext}`;
      const dst = path.join(sessionUploadDir, storedName);
      fs.copyFileSync(filePath, dst);
      const mimeType = getMimeType(filePath);
      const attachmentType: 'image' | 'document' = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'document';
      stored.push({
        id: fileId,
        name: path.basename(filePath),
        stored_name: storedName,
        path: path.relative(this.dataDir, dst),
        type: attachmentType,
        mime_type: mimeType,
        size: fs.statSync(dst).size,
        created_at: Date.now() / 1000,
      });
    }
    return stored;
  }

  private resolveAttachmentPath(item: AttachmentMeta): string | null {
    const rawPath = item.path;
    const normalized = path.normalize(rawPath);
    if (normalized.startsWith('..') || normalized.split(path.sep).includes('..')) {
      return null;
    }
    const absPath = path.resolve(this.dataDir, normalized);
    const uploadsBase = path.resolve(this.uploadsDir);
    if (!absPath.startsWith(uploadsBase + path.sep) && absPath !== uploadsBase) {
      return null;
    }
    return absPath;
  }

  private safeReadTextFile(absPath: string, maxChars = 6000): string {
    try {
      const fd = fs.openSync(absPath, 'r');
      try {
        const buffer = Buffer.alloc(maxChars * 4);
        const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
        return buffer.toString('utf8', 0, Math.min(bytesRead, maxChars * 4)).slice(0, maxChars);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      return '';
    }
  }

  private buildUserMessageForProvider(
    providerName: string,
    userMessage: string,
    attachmentsMeta: AttachmentMeta[],
  ): ProviderMessage {
    if (!attachmentsMeta.length) {
      return { role: 'user', content: userMessage };
    }

    const modality = getProviderModality(providerName);

    if (modality === 'openai-compat') {
      const blocks: Array<Record<string, unknown>> = [{ type: 'text', text: userMessage }];
      const docChunks: string[] = [];
      const unresolvedDocs: string[] = [];

      for (const item of attachmentsMeta) {
        const absPath = this.resolveAttachmentPath(item);
        if (!absPath) {
          unresolvedDocs.push(item.name);
          continue;
        }
        if (item.type === 'image') {
          try {
            const b64 = fs.readFileSync(absPath, 'base64');
            blocks.push({
              type: 'image_url',
              image_url: { url: `data:${item.mime_type};base64,${b64}` },
            });
          } catch {
            unresolvedDocs.push(item.name);
          }
        } else {
          const ext = path.extname(item.name).toLowerCase();
          if (ext === '.txt' || ext === '.md') {
            const snippet = this.safeReadTextFile(absPath);
            if (snippet) {
              docChunks.push(`[文件:${item.name}]\n${snippet}`);
            } else {
              unresolvedDocs.push(item.name);
            }
          } else {
            unresolvedDocs.push(item.name);
          }
        }
      }

      if (docChunks.length) {
        blocks.push({ type: 'text', text: docChunks.join('\n\n') });
      }
      if (unresolvedDocs.length) {
        blocks.push({
          type: 'text',
          text: `以下文件已上传但当前未做文本解析，请结合文件名理解上下文: ${unresolvedDocs.join(', ')}`,
        });
      }
      return { role: 'user', content: blocks };
    }

    if (modality === 'ollama') {
      const images: string[] = [];
      const docChunks: string[] = [];
      const unresolvedDocs: string[] = [];

      for (const item of attachmentsMeta) {
        const absPath = this.resolveAttachmentPath(item);
        if (!absPath) {
          unresolvedDocs.push(item.name);
          continue;
        }
        if (item.type === 'image') {
          try {
            images.push(fs.readFileSync(absPath, 'base64'));
          } catch {
            unresolvedDocs.push(item.name);
          }
        } else {
          const ext = path.extname(item.name).toLowerCase();
          if (ext === '.txt' || ext === '.md') {
            const snippet = this.safeReadTextFile(absPath);
            if (snippet) {
              docChunks.push(`[文件:${item.name}]\n${snippet}`);
            } else {
              unresolvedDocs.push(item.name);
            }
          } else {
            unresolvedDocs.push(item.name);
          }
        }
      }

      const lines: string[] = [userMessage];
      if (docChunks.length) {
        lines.push('', docChunks.join('\n\n'));
      }
      if (unresolvedDocs.length) {
        lines.push('', `以下文件已上传但当前未做文本解析: ${unresolvedDocs.join(', ')}`);
      }
      const message: ProviderMessage = { role: 'user', content: lines.join('\n') };
      if (images.length) message.images = images;
      return message;
    }

    const lines: string[] = [userMessage, '', '附件信息:'];
    for (const item of attachmentsMeta) {
      const itemAbsPath = this.resolveAttachmentPath(item);
      if (!itemAbsPath) {
        lines.push(`- ${item.name} (${item.type}) [路径无效]`);
        continue;
      }
      if (item.type === 'document' && ['.txt', '.md'].includes(path.extname(item.name).toLowerCase())) {
        const snippet = this.safeReadTextFile(itemAbsPath);
        lines.push(`- ${item.name} (${item.type})`);
        if (snippet) {
          lines.push(`  内容摘要: ${snippet.slice(0, 1200)}`);
        }
      } else {
        lines.push(`- ${item.name} (${item.type})`);
      }
    }
    console.warn(`[provider] 未知 provider ${providerName}，附件以纯文本描述形式注入`);
    return { role: 'user', content: lines.join('\n') };
  }

  private messageToProviderFormat(providerName: string, message: BackendHistoryMessage): ProviderMessage {
    const role = message.role;
    const msgContent = message.content;
    const attachments = message.attachments ?? [];
    const blocks = message.blocks ?? [];

    if (role === 'user' && attachments.length > 0) {
      return this.buildUserMessageForProvider(providerName, msgContent, attachments);
    }

    // Convert tool_call blocks to OpenAI tool_calls format
    const toolCalls = blocks
      .filter((b): b is import('../core/types.js').ChatBlock & { type: 'tool_call' } => b.type === 'tool_call')
      .map(b => ({
        id: b.toolCallId ?? '',
        type: 'function' as const,
        function: {
          name: b.toolName ?? '',
          arguments: JSON.stringify(b.toolParams ?? {}),
        },
      }));

    if (toolCalls.length > 0) {
      return { role, content: msgContent || '', tool_calls: toolCalls };
    }

    // Convert tool_result blocks to OpenAI tool message format
    const toolResultBlock = blocks.find((b): b is import('../core/types.js').ChatBlock & { type: 'tool_result' } => b.type === 'tool_result');
    if (toolResultBlock && toolResultBlock.toolCallId) {
      const resultContent = toolResultBlock.toolError
        ? `Error: ${toolResultBlock.toolError}`
        : (typeof toolResultBlock.toolResult === 'string' ? toolResultBlock.toolResult : JSON.stringify(toolResultBlock.toolResult ?? ''));
      return {
        role: 'tool',
        content: resultContent,
        tool_call_id: toolResultBlock.toolCallId,
      };
    }

    return { role, content: msgContent };
  }

  // ==================== Stream ====================

  async *chatStream(
    userMessage: string,
    systemPrompt?: string,
    attachments?: Array<{ path?: string } | string>,
    overrideModel?: string,
    mode?: string,
    reasoning?: unknown,
    sessionId?: string,
  ): AsyncGenerator<StreamChunk> {
    const providerName = this.config.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      yield { type: 'error', data: `未知 provider: ${providerName}` };
      return;
    }

    let chatSessionRow: ChatSessionRow | null = null;
    if (sessionId) {
      chatSessionRow = repoGetChatSession(sessionId);
      if (!chatSessionRow) {
        yield { type: 'error', data: `会话不存在: ${sessionId}` };
        return;
      }
    } else {
      chatSessionRow = repoGetActiveChatSession();
      if (!chatSessionRow) {
        yield { type: 'error', data: '当前没有活动会话' };
        return;
      }
    }
    const targetSessionId = chatSessionRow.id;

    const messages: ProviderMessage[] = [];
    const effectiveSystemPrompt = systemPrompt || (
      mode === 'agent'
        ? '你是一个智能学习助手。你可以使用工具来完成用户的请求。\n\n工具使用规则：\n1. 只读工具（如搜索卡片、搜索笔记、获取统计、读取文件）可以在分析用户需求后主动使用。\n2. 写操作工具（如创建卡片、更新卡片、删除卡片、创建笔记、修改笔记）只能在用户**明确要求**修改数据时才调用。\n3. 如果用户只是打招呼、闲聊或没有明确请求，不要调用任何工具，直接自然回复即可。\n请根据用户的需求，自主决定使用哪些合适的工具。'
        : undefined
    );
    if (effectiveSystemPrompt) {
      messages.push({ role: 'system', content: effectiveSystemPrompt });
    }

    const contextLength = this.config.config.features.context_length;
    if (contextLength > 0) {
      const history = repoListChatMessages(targetSessionId).slice(-(contextLength * 2));
      for (const row of history) {
        messages.push(this.messageToProviderFormat(providerName, rowToHistoryMessage(row)));
      }
    }

    let attachmentsMeta: AttachmentMeta[] = [];
    try {
      attachmentsMeta = this.storeAttachments(attachments, targetSessionId);
    } catch (e) {
      yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
      return;
    }
    messages.push(this.buildUserMessageForProvider(providerName, userMessage, attachmentsMeta));

    const params = this.config.config.parameters;
    const model = overrideModel || this.config.config.current_model;
    const normalizedReasoning = normalizeReasoning(reasoning);

    let userMessageId: string;
    try {
      userMessageId = await this.persistUserMessage(targetSessionId, userMessage, attachmentsMeta);
    } catch (e) {
      yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
      return;
    }
    yield {
      type: 'user_saved',
      data: {
        messageId: userMessageId,
        sessionId: targetSessionId,
        model,
        provider: providerName,
        attachments: attachmentsMeta as unknown as Record<string, unknown>[],
      },
    };

    const cacheKey = this.llmCache.buildCacheKey(providerName, model, messages, params, systemPrompt, targetSessionId, mode);
    const cached = this.llmCache.get(cacheKey);
    if (cached) {
      try {
        for (const chunk of cached) {
          yield chunk;
        }
        yield {
          type: 'stream_end',
          data: {
            sessionId: targetSessionId,
            parentMessageId: userMessageId,
            model,
            provider: providerName,
          },
        };
      } catch (e) {
        yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
      }
      return;
    }

    const collectedChunks: StreamChunk[] = [];
    try {
      const stream = providerName === 'ollama'
        ? this.chatStreamOllama(messages, model, params, providerConfig, mode)
        : this.chatStreamOpenAI(messages, model, params, providerConfig, providerName, mode, normalizedReasoning);

      for await (const chunk of stream) {
        collectedChunks.push(chunk);
        yield chunk;
      }

      this.llmCache.set(cacheKey, collectedChunks);
      yield {
        type: 'stream_end',
        data: {
          sessionId: targetSessionId,
          parentMessageId: userMessageId,
          model,
          provider: providerName,
        },
      };
    } catch (e) {
      yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
    }
  }

  async *regenerateStream(
    parentMessageId: string,
    overrideModel?: string,
    mode?: string,
    reasoning?: unknown,
  ): AsyncGenerator<StreamChunk> {
    const userRow = repoGetChatMessage(parentMessageId);
    if (!userRow || userRow.role !== 'user') {
      yield { type: 'error', data: '父消息不存在或不是用户消息' };
      return;
    }
    const sessionRow = repoGetChatSession(userRow.session_id);
    if (!sessionRow) {
      yield { type: 'error', data: '会话不存在' };
      return;
    }
    const providerName = this.config.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      yield { type: 'error', data: `未知 provider: ${providerName}` };
      return;
    }

    const messages: ProviderMessage[] = [];
    const systemPrompt = mode === 'agent'
      ? '你是一个智能学习助手。你可以使用工具来完成用户的请求。\n\n工具使用规则：\n1. 只读工具（如搜索卡片、搜索笔记、获取统计、读取文件）可以在分析用户需求后主动使用。\n2. 写操作工具（如创建卡片、更新卡片、删除卡片、创建笔记、修改笔记）只能在用户**明确要求**修改数据时才调用。\n3. 如果用户只是打招呼、闲聊或没有明确请求，不要调用任何工具，直接自然回复即可。\n请根据用户的需求，自主决定使用哪些合适的工具。'
      : undefined;
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    const contextLength = this.config.config.features.context_length;
    const allHistory = repoListChatMessages(userRow.session_id);
    const history = contextLength > 0 ? allHistory.slice(-(contextLength * 2)) : allHistory;
    for (const row of history) {
      messages.push(this.messageToProviderFormat(providerName, rowToHistoryMessage(row)));
    }

    const params = this.config.config.parameters;
    const model = overrideModel || this.config.config.current_model;
    const normalizedReasoning = normalizeReasoning(reasoning);

    yield {
      type: 'user_saved',
      data: {
        messageId: userRow.id,
        sessionId: userRow.session_id,
        model,
        provider: providerName,
        attachments: safeParseJsonArray<AttachmentMeta>(userRow.attachments) as unknown as Record<string, unknown>[],
        regenerated: true,
      },
    };

    try {
      const stream = providerName === 'ollama'
        ? this.chatStreamOllama(messages, model, params, providerConfig, mode)
        : this.chatStreamOpenAI(messages, model, params, providerConfig, providerName, mode, normalizedReasoning);

      for await (const chunk of stream) {
        yield chunk;
      }
      yield {
        type: 'stream_end',
        data: {
          sessionId: userRow.session_id,
          parentMessageId: userRow.id,
          model,
          provider: providerName,
        },
      };
    } catch (e) {
      yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
    }
  }

  async *translateStream(text: string, overrideModel?: string): AsyncGenerator<StreamChunk> {
    const providerName = this.config.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      yield { type: 'error', data: `未知 provider: ${providerName}` };
      return;
    }

    const systemPrompt = `You are a professional translator. Translate the user's text while preserving markdown structure.
If the text is primarily Chinese, translate to English. If primarily English or other languages, translate to Simplified Chinese.
Output only the translation, no explanations.`;

    const messages: ProviderMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];
    const params = this.config.config.parameters;
    const model = overrideModel || this.config.config.current_model;

    try {
      const stream = providerName === 'ollama'
        ? this.chatStreamOllama(messages, model, params, providerConfig)
        : this.chatStreamOpenAI(messages, model, params, providerConfig, providerName, undefined, false);

      for await (const chunk of stream) {
        if (chunk.type === 'content' || chunk.type === 'reasoning' || chunk.type === 'error') {
          yield chunk;
        }
        if (chunk.type === 'error') {
          return;
        }
      }
    } catch (e) {
      yield { type: 'error', data: e instanceof Error ? e.message : String(e) };
    }
  }

  private async *chatStreamOpenAI(
    messages: ProviderMessage[],
    model: string,
    params: { temperature?: number; max_tokens?: number; top_p?: number; presence_penalty?: number; frequency_penalty?: number },
    providerConfig: { base_url: string; api_key: string },
    providerName: string,
    mode?: string,
    reasoning: ReasoningEffort | false = false,
  ): AsyncGenerator<StreamChunk> {
    const rawBaseUrl = (providerConfig.base_url || '').replace(/\/$/, '');
    const baseUrl = providerName === 'gemini' ? `${rawBaseUrl}/openai` : rawBaseUrl;
    const apiKey = providerConfig.api_key || '';

    if (isPrivateUrl(rawBaseUrl)) {
      throw new Error('SSRF: 禁止通过非本地 provider 访问私有地址');
    }

    // Enforce HTTPS for non-local providers to protect API keys in transit
    const isLocalProvider = ['ollama', 'lm-studio', 'localai', 'tabbyapi', 'koboldcpp', 'text-generation-webui', 'llamacpp'].includes(providerName);
    if (!isLocalProvider && rawBaseUrl.startsWith('http:')) {
      throw new Error('非本地 Provider 必须使用 HTTPS 以保护 API Key 传输安全');
    }

    const client = new OpenAI({
      apiKey: apiKey || 'dummy',
      baseURL: baseUrl,
      fetch: ((url: Parameters<Fetch>[0], init?: Parameters<Fetch>[1]) => {
        const reqUrl = typeof url === 'string' ? url : url instanceof URL ? url.toString() : new URL((url as { url: string }).url).toString();
        const reqInit = init || {};
        let headers: Record<string, string> = {};
        if (reqInit.headers instanceof Headers) {
          headers = Object.fromEntries(reqInit.headers.entries());
        } else if (typeof reqInit.headers === 'object') {
          headers = { ...(reqInit.headers as Record<string, string>) };
        }
        if (!apiKey && headers['authorization']) {
          delete headers['authorization'];
        }

        delete headers['content-length'];
        return fetchWithProxy(reqUrl, { ...reqInit, headers } as unknown as RequestInit) as unknown as ReturnType<Fetch>;
      }) as Fetch,
    });

    const baseParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      stream: true,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.max_tokens ?? 2000,
    };
    if (params.top_p !== undefined) baseParams.top_p = params.top_p;
    if (params.presence_penalty !== undefined) baseParams.presence_penalty = params.presence_penalty;
    if (params.frequency_penalty !== undefined) baseParams.frequency_penalty = params.frequency_penalty;

    const requestParams: RequestParamsWithReasoning = baseParams;

    if (mode === 'agent') {
      const cardTools = new PapyrusTools();
      const tools: OpenAIToolDef[] = cardTools.getToolsForOpenAI();
      requestParams.tools = tools as unknown as OpenAI.Chat.ChatCompletionTool[];
      requestParams.tool_choice = 'auto';
    }

    if (reasoning) {
      const kind = modelSupportsReasoning(providerName, model);
      if (kind === 'reasoning_effort') {
        // OpenAI-compatible APIs only support 'low' | 'medium' | 'high'; downgrade 'very_high' to 'high'
        requestParams.reasoning_effort = reasoning === 'very_high' ? 'high' : reasoning;
      } else if (kind === 'thinking') {
        requestParams.thinking = { type: 'enabled', budget_tokens: REASONING_BUDGET[reasoning] };
      } else if (kind === 'thinking_config') {
        requestParams.thinking_config = { thinking_budget: REASONING_BUDGET[reasoning] };
      }
    }

    const stream = await client.chat.completions.create(requestParams);

    interface PendingToolCall {
      id: string;
      name: string;
      args: string;
    }
    const pending = new Map<number, PendingToolCall>();
    let finishedToolCalls = false;

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      const reasoningContent = (delta as Record<string, unknown>).reasoning_content;
      if (typeof reasoningContent === 'string' && reasoningContent) {
        yield { type: 'reasoning', data: reasoningContent };
      }
      if (delta.content) {
        yield { type: 'content', data: delta.content };
      }
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc.index === 'number' ? tc.index : 0;
          const entry = pending.get(idx) ?? { id: '', name: '', args: '' };
          if (typeof tc.id === 'string') entry.id = tc.id;
          if (tc.function) {
            if (typeof tc.function.name === 'string') entry.name = tc.function.name;
            if (typeof tc.function.arguments === 'string') entry.args += tc.function.arguments;
          }
          pending.set(idx, entry);
        }
      }
      if (choice.finish_reason === 'tool_calls') {
        finishedToolCalls = true;
      }
    }

    if (pending.size > 0 || finishedToolCalls) {
      const indices = [...pending.keys()].sort((a, b) => a - b);
      for (const idx of indices) {
        const entry = pending.get(idx);
        if (!entry || !entry.name) continue;
        let parsedArgs: Record<string, unknown> = {};
        if (entry.args.trim()) {
          try {
            const parsed = JSON.parse(entry.args) as unknown;
            if (parsed !== null && typeof parsed === 'object') {
              parsedArgs = parsed as Record<string, unknown>;
            }
          } catch {
            yield { type: 'error', data: `工具参数 JSON 解析失败: ${entry.name}` };
            continue;
          }
        }
        yield {
          type: 'tool_start',
          data: {
            id: entry.id,
            type: 'function',
            function: { name: entry.name, arguments: entry.args },
            args: parsedArgs,
          },
        };
      }
    }
  }

  private async *chatStreamOllama(
    messages: ProviderMessage[],
    model: string,
    params: { temperature?: number },
    providerConfig: { base_url: string },
    mode?: string,
  ): AsyncGenerator<StreamChunk> {
    const baseUrl = providerConfig.base_url.replace(/\/$/, '');

    const enrichedMessages = mode === 'agent'
      ? this.injectOllamaToolPrompt(messages)
      : messages;

    // Build native tools for Ollama (OpenAI-compatible format)
    const ollamaTools = mode === 'agent' ? new PapyrusTools().getToolsForOpenAI() : undefined;

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model,
        messages: enrichedMessages,
        stream: true,
        options: { temperature: params.temperature ?? 0.7 },
        ...(ollamaTools && ollamaTools.length > 0 ? { tools: ollamaTools } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API 错误: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取 Ollama 响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line) as unknown;
          if (chunk === null || typeof chunk !== 'object') continue;
          const dict = chunk as Record<string, unknown>;
          if (dict.done === true) return;

          const message = dict.message as Record<string, unknown> | undefined;
          if (!message) continue;

          const content = message.content;
          if (typeof content === 'string' && content) {
            yield { type: 'content', data: content };
          }

          const toolCalls = message.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const toolCall of toolCalls) {
              yield { type: 'tool_start', data: toolCall as Record<string, unknown> };
            }
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  }

  private injectOllamaToolPrompt(messages: ProviderMessage[]): ProviderMessage[] {
    const cardTools = new PapyrusTools();
    const toolHint = cardTools.getToolsDefinition();
    const out = [...messages];
    const sysIdx = out.findIndex(m => m.role === 'system');
    if (sysIdx >= 0) {
      const existing = out[sysIdx];
      if (existing) {
        const existingContent = typeof existing.content === 'string' ? existing.content : '';
        out[sysIdx] = { ...existing, content: `${existingContent}\n\n${toolHint}` };
      }
    } else {
      out.unshift({ role: 'system', content: toolHint });
    }
    return out;
  }

  // ==================== Convenience APIs ====================

  getHint(question: string): Promise<string> {
    const prompt = `用户正在学习这个问题：\n${question}\n\n请给出一个不直接透露答案的提示，帮助用户思考。`;
    return this.chat(prompt, '你是一个学习助手，擅长给出启发性的提示而不是直接答案。');
  }

  explainAnswer(question: string, answer: string): Promise<string> {
    const prompt = `题目：${question}\n答案：${answer}\n\n请用简单易懂的语言解释这个答案，帮助加深理解。`;
    return this.chat(prompt, '你是一个学习助手，擅长用通俗的语言解释复杂概念。');
  }

  generateRelated(question: string, answer: string): Promise<string> {
    const prompt = `基于这个知识点：\n题目：${question}\n答案：${answer}\n\n请生成3个相关的问题，帮助巩固这个知识点。`;
    return this.chat(prompt, '你是一个学习助手，擅长设计相关的练习题。');
  }

  async chat(userMessage: string, systemPrompt?: string): Promise<string> {
    const collectedText: string[] = [];
    const collectedReasoning: string[] = [];
    const blocks: ChatBlock[] = [];
    let parentMessageId: string | null = null;
    let sessionIdForFinalize: string | null = null;
    let modelUsed = '';
    let providerUsed = '';

    for await (const chunk of this.chatStream(userMessage, systemPrompt)) {
      if (chunk.type === 'user_saved') {
        const data = chunk.data as Record<string, unknown>;
        parentMessageId = typeof data.messageId === 'string' ? data.messageId : null;
        sessionIdForFinalize = typeof data.sessionId === 'string' ? data.sessionId : null;
        modelUsed = typeof data.model === 'string' ? data.model : '';
        providerUsed = typeof data.provider === 'string' ? data.provider : '';
      } else if (chunk.type === 'content') {
        collectedText.push(typeof chunk.data === 'string' ? chunk.data : '');
      } else if (chunk.type === 'reasoning') {
        collectedReasoning.push(typeof chunk.data === 'string' ? chunk.data : '');
      } else if (chunk.type === 'stream_end') {
        break;
      } else if (chunk.type === 'error') {
        throw new Error(typeof chunk.data === 'string' ? chunk.data : 'AI 调用失败');
      }
    }

    const reasoningText = collectedReasoning.join('');
    const contentText = collectedText.join('');
    if (reasoningText) blocks.push({ type: 'reasoning', text: reasoningText });
    if (contentText) blocks.push({ type: 'text', text: contentText });

    if (sessionIdForFinalize) {
      await this.persistAssistantMessage({
        sessionId: sessionIdForFinalize,
        content: contentText,
        blocks,
        model: modelUsed,
        provider: providerUsed,
        parentMessageId,
      });
    }
    return contentText;
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
