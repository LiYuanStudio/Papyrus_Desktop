import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AIConfig } from '../../src/ai/config.js';
import { AIManager, getProviderModality, modelSupportsReasoning } from '../../src/ai/provider.js';
import {
  closeDb,
  createChatSession,
  appendChatMessage,
  getChatSession,
} from '../../src/db/database.js';

describe('AI provider helpers and manager utilities', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-ai-provider-helpers-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    closeDb();
    const dbFile = path.join(testDir, 'papyrus.db');
    if (fs.existsSync(dbFile)) {
      fs.rmSync(dbFile);
    }
  });

  function createManager(): AIManager {
    const config = new AIConfig(testDir);
    return new AIManager(config);
  }

  it('provider helpers should classify modality and reasoning support', () => {
    expect(getProviderModality('ollama')).toBe('ollama');
    expect(getProviderModality('openai')).toBe('openai-compat');
    expect(getProviderModality('unknown-provider')).toBe('text-only');

    expect(modelSupportsReasoning('openai', 'gpt-5')).toBe('reasoning_effort');
    expect(modelSupportsReasoning('anthropic', 'claude-sonnet-4')).toBe('thinking');
    expect(modelSupportsReasoning('gemini', 'gemini-2.5-pro')).toBe('thinking_config');
    expect(modelSupportsReasoning('openai', 'gpt-4o-mini')).toBe(false);
  });

  it('session helpers should create, switch, rename, delete and reset sessions', () => {
    const manager = createManager();
    const initial = manager.getActiveSession();
    expect(initial).not.toBeNull();

    const created = manager.createSession('  Session A  ', true);
    expect(created.title).toBe('Session A');
    expect(manager.getActiveSessionId()).toBe(created.id);
    expect(manager.listSessions().some((item) => item.id === created.id)).toBe(true);

    const renamed = manager.renameSession(created.id, '  Renamed Session  ');
    expect(renamed.title).toBe('Renamed Session');
    expect(manager.getActiveSessionTitle()).toBe('Renamed Session');

    const another = manager.createSession('', false);
    expect(another.title.length).toBeGreaterThan(0);

    const switched = manager.switchSession(another.id);
    expect(switched.id).toBe(another.id);
    expect(manager.getSession(another.id)?.id).toBe(another.id);

    expect(() => manager.switchSession('missing-session')).toThrow('会话不存在');
    expect(() => manager.renameSession('missing-session', 'x')).toThrow('会话不存在');

    const clearResult = manager.clearAllSessions();
    expect(clearResult.deletedCount).toBeGreaterThanOrEqual(1);
    expect(clearResult.activeSessionId).toBeTruthy();

    manager.reset();
    expect(manager.getActiveSessionId()).toBeTruthy();

    const deleted = manager.deleteSession(manager.getActiveSessionId() ?? '');
    expect(deleted.activeSessionId).toBeTruthy();

    expect(() => manager.deleteSession('missing-session')).toThrow('会话不存在');
  });

  it('message helpers should list, fetch, soft-delete, regenerate and clear history', () => {
    const manager = createManager();
    const session = manager.createSession('Messages', true);

    const userRow = appendChatMessage({
      session_id: session.id,
      role: 'user',
      content: 'Question',
      attachments: JSON.stringify([{ id: 'a1', name: 'x.txt' }]),
    });
    const assistantRow = appendChatMessage({
      session_id: session.id,
      role: 'assistant',
      content: 'Answer',
      parent_message_id: userRow.id,
    });

    expect(manager.listMessages(session.id).length).toBe(2);
    expect(manager.getMessage(assistantRow.id)?.content).toBe('Answer');

    expect(manager.updateMessage(assistantRow.id, { content: 'Updated answer' })).toBe(true);
    expect(manager.getMessage(assistantRow.id)?.content).toBe('Updated answer');
    expect(manager.updateMessage('missing-message', { content: 'x' })).toBe(false);

    const prepared = manager.prepareRegenerate(assistantRow.id);
    expect(prepared).not.toBeNull();
    expect(prepared?.sessionId).toBe(session.id);
    expect(prepared?.userMessage).toBe('Question');
    expect(prepared?.userAttachments.length).toBe(1);

    expect(manager.prepareRegenerate(userRow.id)).toBeNull();
    expect(manager.prepareRegenerate('missing-message')).toBeNull();

    const extraRow = appendChatMessage({
      session_id: session.id,
      role: 'assistant',
      content: 'Delete me',
    });
    expect(manager.deleteMessage(extraRow.id)).toBe(true);
    expect(manager.deleteMessage('missing-message')).toBe(false);

    manager.clearHistory();
    expect(manager.getActiveSessionId()).toBeTruthy();
  });

  it('persist helpers should store user and assistant messages with structured blocks', async () => {
    const manager = createManager();
    const session = manager.getActiveSession();
    if (!session) {
      throw new Error('expected active session');
    }

    const userId = await manager.persistUserMessage(session.id, 'Hello user', []);
    expect(userId).toBeTruthy();

    const assistantId = await manager.persistAssistantMessage({
      sessionId: session.id,
      content: 'Hello assistant',
      blocks: [{ type: 'text', text: 'Hello assistant' }],
      model: 'gpt-test',
      provider: 'openai',
      parentMessageId: userId,
      tokenUsage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    });
    expect(assistantId).toBeTruthy();

    const messages = manager.listMessages(session.id);
    expect(messages.length).toBe(2);
    expect(messages[1]?.blocks[0]?.type).toBe('text');
    expect(messages[1]?.parentMessageId).toBe(userId);
  });

  it('attachment helpers should validate, store, resolve and read supported files safely', () => {
    const manager = createManager();
    const session = manager.getActiveSession();
    if (!session) {
      throw new Error('expected active session');
    }

    const vaultDir = path.join(testDir, 'vault');
    fs.mkdirSync(vaultDir, { recursive: true });
    const txtPath = path.join(vaultDir, 'note.txt');
    const mdPath = path.join(vaultDir, 'doc.md');
    const pngPath = path.join(vaultDir, 'image.png');
    const badPath = path.join(vaultDir, 'bad.exe');
    fs.writeFileSync(txtPath, 'hello text file');
    fs.writeFileSync(mdPath, '# heading\nbody');
    fs.writeFileSync(pngPath, 'png-bytes');
    fs.writeFileSync(badPath, 'binary');

    const validateAttachments = (
      manager as unknown as {
        validateAttachments: (attachments: Array<{ path?: string } | string> | null | undefined) => string[];
      }
    ).validateAttachments.bind(manager);
    const storeAttachments = (
      manager as unknown as {
        storeAttachments: (attachments: Array<{ path?: string } | string> | null | undefined, sessionId: string) => Array<Record<string, unknown>>;
      }
    ).storeAttachments.bind(manager);
    const resolveAttachmentPath = (
      manager as unknown as {
        resolveAttachmentPath: (item: { path: string }) => string | null;
      }
    ).resolveAttachmentPath.bind(manager);
    const safeReadTextFile = (
      manager as unknown as {
        safeReadTextFile: (absPath: string, maxChars?: number) => string;
      }
    ).safeReadTextFile.bind(manager);
    const buildUserMessageForProvider = (
      manager as unknown as {
        buildUserMessageForProvider: (
          providerName: string,
          userMessage: string,
          attachmentsMeta: Array<{
            id: string;
            name: string;
            stored_name: string;
            path: string;
            type: 'image' | 'document';
            mime_type: string;
            size: number;
            created_at: number;
          }>,
        ) => { role: string; content: string | Array<Record<string, unknown>>; images?: string[] };
      }
    ).buildUserMessageForProvider.bind(manager);
    const messageToProviderFormat = (
      manager as unknown as {
        messageToProviderFormat: (
          providerName: string,
          message: {
            role: string;
            content: string;
            attachments: Array<{
              id: string;
              name: string;
              stored_name: string;
              path: string;
              type: 'image' | 'document';
              mime_type: string;
              size: number;
              created_at: number;
            }>;
          },
        ) => { role: string; content: string | Array<Record<string, unknown>>; images?: string[] };
      }
    ).messageToProviderFormat.bind(manager);
    const injectOllamaToolPrompt = (
      manager as unknown as {
        injectOllamaToolPrompt: (messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>) => Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
      }
    ).injectOllamaToolPrompt.bind(manager);

    expect(validateAttachments(null)).toEqual([]);
    expect(validateAttachments([{ path: txtPath }, mdPath])).toEqual([txtPath, mdPath]);

    expect(() => validateAttachments(new Array(6).fill(txtPath))).toThrow('单次最多上传 5 个附件');
    expect(() => validateAttachments(['../evil.txt'])).toThrow('非法文件路径');
    expect(() => validateAttachments([badPath])).toThrow('不支持的文件类型');

    const outsideFile = path.join(path.dirname(testDir), 'outside.txt');
    fs.writeFileSync(outsideFile, 'outside');
    expect(() => validateAttachments([outsideFile])).toThrow('附件必须位于 Papyrus 工作区内');

    const stored = storeAttachments([txtPath, mdPath, pngPath], session.id) as Array<{
      name: string;
      path: string;
      type: 'image' | 'document';
      mime_type: string;
    }>;
    expect(stored.length).toBe(3);
    expect(stored.some((item) => item.type === 'image')).toBe(true);

    const resolvedTxtPath = resolveAttachmentPath({ path: stored[0]?.path ?? '' });
    expect(resolvedTxtPath).toBeTruthy();
    expect(resolveAttachmentPath({ path: '..\\escape.txt' })).toBeNull();
    expect(resolveAttachmentPath({ path: 'vault\\note.txt' })).toBeNull();

    expect(safeReadTextFile(resolvedTxtPath ?? '', 5)).toBe('hello');
    expect(safeReadTextFile(path.join(testDir, 'missing.txt'))).toBe('');

    const openAIMessage = buildUserMessageForProvider('openai', 'Prompt', stored);
    expect(openAIMessage.role).toBe('user');
    expect(Array.isArray(openAIMessage.content)).toBe(true);

    const ollamaMessage = buildUserMessageForProvider('ollama', 'Prompt', stored);
    expect(ollamaMessage.role).toBe('user');
    expect(typeof ollamaMessage.content).toBe('string');
    expect(Array.isArray(ollamaMessage.images)).toBe(true);

    const textOnlyMessage = buildUserMessageForProvider('mystery-provider', 'Prompt', stored);
    expect(typeof textOnlyMessage.content).toBe('string');

    const forwardedUserMessage = messageToProviderFormat('openai', {
      role: 'user',
      content: 'Question',
      attachments: stored,
    });
    expect(forwardedUserMessage.role).toBe('user');

    const forwardedAssistantMessage = messageToProviderFormat('openai', {
      role: 'assistant',
      content: 'Answer',
      attachments: stored,
    });
    expect(forwardedAssistantMessage.content).toBe('Answer');

    const withExistingSystem = injectOllamaToolPrompt([
      { role: 'system', content: 'Existing system prompt' },
      { role: 'user', content: 'hello' },
    ]);
    expect(String(withExistingSystem[0]?.content)).toContain('Existing system prompt');

    const withoutSystem = injectOllamaToolPrompt([{ role: 'user', content: 'hello' }]);
    expect(withoutSystem[0]?.role).toBe('system');
  });

  it('chat convenience methods should consume chatStream and persist assistant output', async () => {
    const manager = createManager();
    const session = manager.getActiveSession();
    if (!session) {
      throw new Error('expected active session');
    }

    const originalChatStream = manager.chatStream.bind(manager);
    manager.chatStream = async function* () {
      yield {
        type: 'user_saved',
        data: {
          messageId: 'parent-1',
          sessionId: session.id,
          model: 'gpt-test',
          provider: 'openai',
        },
      };
      yield { type: 'reasoning', data: 'think ' };
      yield { type: 'content', data: 'answer' };
      yield { type: 'stream_end', data: {} };
    };

    try {
      const answer = await manager.chat('Question?', 'System prompt');
      expect(answer).toBe('answer');
      const messages = manager.listMessages(session.id);
      expect(messages.some((item) => item.content === 'answer')).toBe(true);
    } finally {
      manager.chatStream = originalChatStream;
    }

    manager.chatStream = async function* () {
      yield { type: 'error', data: 'boom' };
    };
    await expect(manager.chat('Question?', 'System prompt')).rejects.toThrow('boom');

    manager.chatStream = originalChatStream;
  });

  it('prepareRegenerate should remove later messages from the session', () => {
    createChatSession({ id: 'session-regen', title: 'regen session' });
    const user = appendChatMessage({
      session_id: 'session-regen',
      role: 'user',
      content: 'Q1',
      created_at: 1,
    });
    const assistant = appendChatMessage({
      session_id: 'session-regen',
      role: 'assistant',
      content: 'A1',
      parent_message_id: user.id,
      created_at: 2,
    });
    appendChatMessage({
      session_id: 'session-regen',
      role: 'assistant',
      content: 'later',
      created_at: 3,
    });

    const manager = createManager();
    const prepared = manager.prepareRegenerate(assistant.id);
    expect(prepared?.parentMessageId).toBe(user.id);

    const session = getChatSession('session-regen');
    expect(session?.message_count).toBe(1);
  });
  describe('edge cases', () => {
    it('getProviderModality returns default for unknown model', async () => {
      const { getProviderModality } = await import('../../src/ai/provider.js');
      expect(getProviderModality('unknown-vendor-model')).toBe('text-only');
    });

    it('modelSupportsReasoning returns none for non-reasoning models', async () => {
      const { modelSupportsReasoning } = await import('../../src/ai/provider.js');
      expect(modelSupportsReasoning('openai', 'gpt-3.5-turbo')).toBe(false);
      expect(modelSupportsReasoning('anthropic', 'claude-instant')).toBe(false);
    });
  });
});
