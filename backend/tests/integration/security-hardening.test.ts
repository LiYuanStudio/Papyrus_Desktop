import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDb, getDb, resetDb, saveApiKey, saveModel, saveProvider } from '../../src/db/database.js';
import { saveFile } from '../../src/core/files.js';
import { getMcpToolsCatalog, executeMcpTool } from '../../src/mcp/tools.js';
import { testAuthHeaders } from '../test-auth.js';

type InjectResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => unknown;
};

type InjectableApp = {
  inject: (opts: Record<string, unknown>) => Promise<InjectResponse>;
};

describe('Security Hardening Integration', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-security-hardening-${Date.now()}`);
  const authToken = 'security-hardening-token-' + 'z'.repeat(24);
  let app: InjectableApp;
  let originalDataDir: string | undefined;
  let originalAuthToken: string | undefined;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    originalDataDir = process.env.PAPYRUS_DATA_DIR;
    originalAuthToken = process.env.PAPYRUS_AUTH_TOKEN;
    process.env.PAPYRUS_DATA_DIR = testDir;
    process.env.PAPYRUS_AUTH_TOKEN = authToken;
    resetDb();

    const serverModule = await import('../../src/api/server.js');
    await serverModule.initApp();
    app = serverModule.app as InjectableApp;
  });

  afterAll(() => {
    closeDb();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    if (originalDataDir !== undefined) {
      process.env.PAPYRUS_DATA_DIR = originalDataDir;
    } else {
      delete process.env.PAPYRUS_DATA_DIR;
    }
    if (originalAuthToken !== undefined) {
      process.env.PAPYRUS_AUTH_TOKEN = originalAuthToken;
    } else {
      delete process.env.PAPYRUS_AUTH_TOKEN;
    }
  });

  describe('Authentication boundaries', () => {
    it('rejects sensitive GET endpoints without token', async () => {
      const endpoints = ['/api/providers', '/api/export', '/api/notes', '/api/mcp/cards'];
      for (const url of endpoints) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(401);
      }
    });

    it('rejects MCP call without token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/mcp/call',
        payload: { tool: 'get_card_stats', params: {} },
      });
      expect(response.statusCode).toBe(401);
    });

    it('allows file media routes with access_token query param', async () => {
      const content = Buffer.from('preview text').toString('base64');
      const file = saveFile('preview.txt', content, 'text/plain');
      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/preview?access_token=${encodeURIComponent(authToken)}`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('preview text');
    });

    it('rejects file media routes with invalid access_token', async () => {
      const content = Buffer.from('secret').toString('base64');
      const file = saveFile('secret.txt', content, 'text/plain');
      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/preview?access_token=wrong-token-value`,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('Provider API key masking', () => {
    it('never returns plaintext API keys on GET /api/providers', async () => {
      const providerId = saveProvider({
        id: 'sec-provider-mask',
        type: 'openai',
        name: 'Mask Test',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        isDefault: false,
      });
      saveApiKey(providerId, { id: 'sec-key-1', name: 'default', key: 'sk-super-secret-key-value' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/providers',
        headers: testAuthHeaders(),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        providers: Array<{
          id: string;
          apiKeys: Array<{ key: string; hasKey?: boolean }>;
        }>;
      };
      const provider = body.providers.find((item) => item.id === providerId);
      expect(provider).toBeDefined();
      expect(provider?.apiKeys[0]?.hasKey).toBe(true);
      expect(provider?.apiKeys[0]?.key).not.toContain('sk-super-secret');
      expect(provider?.apiKeys[0]?.key).toMatch(/^\*+$/);
    });

    it('preserves stored API key when update submits masked placeholder', async () => {
      const providerId = saveProvider({
        id: 'sec-provider-preserve',
        type: 'openai',
        name: 'Preserve Test',
        baseUrl: 'https://api.openai.com/v1',
        enabled: true,
        isDefault: false,
      });
      saveApiKey(providerId, { id: 'sec-key-preserve', name: 'default', key: 'sk-original-secret' });

      const updateResponse = await app.inject({
        method: 'PUT',
        url: `/api/providers/${providerId}`,
        headers: testAuthHeaders(),
        payload: {
          type: 'openai',
          name: 'Preserve Test Updated',
          baseUrl: 'https://api.openai.com/v1',
          enabled: true,
          apiKeys: [{ id: 'sec-key-preserve', name: 'default', key: '********cret', hasKey: true }],
        },
      });
      expect(updateResponse.statusCode).toBe(200);

      const row = getDb()
        .prepare('SELECT encrypted_key FROM api_keys WHERE id = ?')
        .get('sec-key-preserve') as { encrypted_key: string } | undefined;
      expect(row?.encrypted_key).toBeTruthy();
      expect(row?.encrypted_key).not.toBe('sk-original-secret');

      const { decryptApiKey } = await import('../../src/core/crypto.js');
      expect(decryptApiKey(row?.encrypted_key ?? '')).toBe('sk-original-secret');
    });
  });

  describe('Provider URL validation', () => {
    it('rejects remote provider with private baseUrl on create', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        headers: testAuthHeaders(),
        payload: {
          id: 'sec-provider-ssrf',
          type: 'openai',
          name: 'SSRF Blocked',
          baseUrl: 'http://192.168.1.50/v1',
          enabled: true,
          apiKeys: [{ id: 'k1', name: 'default', key: 'sk-test' }],
        },
      });
      expect(response.statusCode).toBe(400);
      const body = response.json() as { error?: string };
      expect(body.error).toMatch(/SSRF|私有/);
    });

    it('rejects ollama provider with non-localhost baseUrl on create', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        headers: testAuthHeaders(),
        payload: {
          id: 'sec-provider-ollama-remote',
          type: 'ollama',
          name: 'Ollama Remote',
          baseUrl: 'http://192.168.1.10:11434',
          enabled: true,
        },
      });
      expect(response.statusCode).toBe(400);
      const body = response.json() as { error?: string };
      expect(body.error).toMatch(/localhost|127\.0\.0\.1|本地/);
    });
  });

  describe('Keyless provider connection test SSRF', () => {
    it('blocks keyless provider test against non-localhost URL', async () => {
      const providerId = saveProvider({
        id: 'sec-ollama-bad-url',
        type: 'ollama',
        name: 'Bad Ollama',
        baseUrl: 'http://192.168.1.20:11434',
        enabled: true,
        isDefault: true,
      });
      saveModel(providerId, { id: 'sec-model-llama3', name: 'llama3', modelId: 'llama3', enabled: true });

      const { aiConfig } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/ai/test',
        headers: testAuthHeaders(),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { success: boolean; error?: string };
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/localhost|127\.0\.0\.1|本地/);
    });
  });

  describe('MCP hardening', () => {
    it('does not expose cli_run in MCP catalog', () => {
      const catalog = getMcpToolsCatalog();
      expect(catalog.tools).not.toContain('cli_run');
      expect(catalog.categories.cli).not.toContain('cli_run');
    });

    it('rejects cli_run execution via executeMcpTool', async () => {
      const result = await executeMcpTool('cli_run', { args: ['status'] });
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('未知工具');
    });
  });

  describe('File preview response headers', () => {
    it('serves text preview inline with sandbox CSP', async () => {
      const content = Buffer.from('inline text').toString('base64');
      const file = saveFile('inline.txt', content, 'text/plain');
      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/preview`,
        headers: testAuthHeaders(),
      });
      expect(response.statusCode).toBe(200);
      expect(String(response.headers['content-disposition'] ?? '')).toContain('inline');
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    it('forces attachment for non-image binary preview', async () => {
      const content = Buffer.from('%PDF-1.4 fake').toString('base64');
      const file = saveFile('doc.pdf', content, 'application/pdf');
      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${file.id}/preview`,
        headers: testAuthHeaders(),
      });
      expect(response.statusCode).toBe(200);
      expect(String(response.headers['content-disposition'] ?? '')).toContain('attachment');
    });
  });
});
