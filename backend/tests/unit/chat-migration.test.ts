import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { saveProvider, saveApiKey, saveModel, closeDb, listChatSessions, listChatMessages, clearAllChatSessions } from '../../src/db/database.js';

interface ConfigLike {
  config: {
    current_provider: string;
    current_model: string;
    providers: Record<string, unknown>;
    parameters?: unknown;
    features?: unknown;
    log?: unknown;
    [key: string]: unknown;
  };
  configFile: string;
}

interface ManagerLike {
  listSessions(): Array<Record<string, unknown>>;
  getActiveSession(): Record<string, unknown>;
  conversationsDir: string;
  legacySessionsFile: string;
}

describe('Chat Sessions Legacy Migration', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-chat-migrate-test-${Date.now()}`);
  const conversationsDir = path.join(testDir, 'conversations');
  const sessionsFile = path.join(conversationsDir, 'sessions.json');
  const dbPath = path.join(testDir, 'papyrus.db');

  let AIManager: new (config: ConfigLike) => ManagerLike;
  let AIConfig: new (dataDir: string) => ConfigLike;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(conversationsDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    const aiModule = await import('../../src/ai/provider.js');
    const configModule = await import('../../src/ai/config.js');
    AIManager = aiModule.AIManager as unknown as new (config: ConfigLike) => ManagerLike;
    AIConfig = configModule.AIConfig as unknown as new (dataDir: string) => ConfigLike;

    // Seed minimal provider so AIManager can construct
    const providerId = saveProvider({
      id: 'p-ollama-migrate',
      type: 'ollama',
      name: 'ollama',
      baseUrl: 'http://localhost:11434',
      enabled: true,
      isDefault: true,
    });
    saveApiKey(providerId, { id: 'k-ollama-migrate', name: 'default', key: '' });
    saveModel(providerId, { id: 'm-llama2-migrate', modelId: 'llama2', name: 'llama2', enabled: true });
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    // Clear DB chat tables and any leftover legacy file
    clearAllChatSessions();
    if (fs.existsSync(sessionsFile)) {
      fs.rmSync(sessionsFile, { force: true });
    }
    const bak = sessionsFile + '.bak';
    if (fs.existsSync(bak)) {
      fs.rmSync(bak, { force: true });
    }
  });

  function buildConfig(): ConfigLike {
    const config = new AIConfig(testDir);
    config.config.current_provider = 'ollama';
    config.config.current_model = 'llama2';
    config.config.providers.ollama = { api_key: '', base_url: 'http://localhost:11434', models: ['llama2'] };
    (config.config.features as Record<string, unknown>).cache_enabled = false;
    return config;
  }

  function writeLegacySessionsFile(payload: unknown): void {
    fs.writeFileSync(sessionsFile, JSON.stringify(payload), 'utf8');
  }

  it('should import legacy sessions.json into the DB and rename file to .bak', () => {
    writeLegacySessionsFile({
      active_session_id: 's1',
      sessions: [
        {
          id: 's1',
          title: '会话一',
          created_at: 100,
          updated_at: 200,
          messages: [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好，需要什么帮助？' },
          ],
        },
        {
          id: 's2',
          title: '会话二',
          created_at: 50,
          updated_at: 150,
          messages: [{ role: 'user', content: '一个旧问题' }],
        },
      ],
    });

    new AIManager(buildConfig());

    const sessions = listChatSessions();
    expect(sessions.length).toBe(2);
    const ids = sessions.map((s) => s.id).sort();
    expect(ids).toEqual(['s1', 's2']);
    const s1 = sessions.find((s) => s.id === 's1');
    expect(s1?.title).toBe('会话一');

    const s1Messages = listChatMessages('s1');
    expect(s1Messages.length).toBe(2);
    expect(s1Messages[0]?.role).toBe('user');
    expect(s1Messages[1]?.role).toBe('assistant');
    // Assistant should chain back to its preceding user message
    expect(s1Messages[1]?.parent_message_id).toBe(s1Messages[0]?.id);

    const blocks = JSON.parse(s1Messages[0]?.blocks ?? '[]');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks[0]).toEqual({ type: 'text', text: '你好' });

    expect(fs.existsSync(sessionsFile)).toBe(false);
    expect(fs.existsSync(sessionsFile + '.bak')).toBe(true);
  });

  it('should be idempotent: a second construct does not double-import', () => {
    writeLegacySessionsFile({
      active_session_id: 'only',
      sessions: [
        { id: 'only', title: 'only', updated_at: 1, messages: [{ role: 'user', content: 'hi' }] },
      ],
    });

    new AIManager(buildConfig());
    expect(listChatSessions().length).toBe(1);
    // Re-create the legacy file (simulate stale data) and ensure migration short-circuits
    writeLegacySessionsFile({
      active_session_id: 'fake',
      sessions: [{ id: 'fake', title: 'should-not-import', updated_at: 999, messages: [] }],
    });
    new AIManager(buildConfig());
    const ids = listChatSessions().map((s) => s.id);
    expect(ids).toContain('only');
    expect(ids).not.toContain('fake');
    expect(fs.existsSync(sessionsFile)).toBe(false);
    expect(fs.existsSync(sessionsFile + '.bak')).toBe(true);
  });

  it('should not throw and should preserve original file on malformed JSON', () => {
    fs.writeFileSync(sessionsFile, '{ this is not valid json', 'utf8');
    expect(() => new AIManager(buildConfig())).not.toThrow();
    // No imports happened
    const sessions = listChatSessions();
    // Constructor still ensures one default session exists
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    // Original malformed file is preserved (no .bak rename on parse failure)
    expect(fs.existsSync(sessionsFile)).toBe(true);
  });

  it('should ensure at least one default session when no legacy file exists', () => {
    expect(fs.existsSync(sessionsFile)).toBe(false);
    new AIManager(buildConfig());
    const sessions = listChatSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
  });

  // Sanity: after each test the DB file must exist (no accidental wipe)
  it('keeps the database file present after migration', () => {
    writeLegacySessionsFile({ active_session_id: 's', sessions: [{ id: 's', title: 't', messages: [] }] });
    new AIManager(buildConfig());
    expect(fs.existsSync(dbPath)).toBe(true);
  });
});
