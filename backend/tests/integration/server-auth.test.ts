import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { resetDb, closeDb } from '../../src/db/database.js';

describe('Server Auth Hook', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-server-auth-test-${Date.now()}`);
  let originalEnv: string | undefined;
  let authToken: string;
  let app: unknown;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    originalEnv = process.env.PAPYRUS_DATA_DIR;
    process.env.PAPYRUS_DATA_DIR = testDir;
    resetDb();
    authToken = 'test-auth-token-' + 'x'.repeat(32);
    process.env.PAPYRUS_AUTH_TOKEN = authToken;

    const serverModule = await import('../../src/api/server.js');
    await serverModule.initApp();
    app = serverModule.app;
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows
    }
    closeDb();
    if (originalEnv !== undefined) {
      process.env.PAPYRUS_DATA_DIR = originalEnv;
    } else {
      delete process.env.PAPYRUS_DATA_DIR;
    }
    delete process.env.PAPYRUS_AUTH_TOKEN;
  });

  it('should allow /api/health without auth token', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject sensitive GET without auth token', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
      method: 'GET',
      url: '/api/notes',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should reject mutating request without auth token', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Test' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('should allow authenticated GET requests', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number; json: () => Promise<unknown> }> }).inject({
      method: 'GET',
      url: '/api/notes',
      headers: { 'x-papyrus-token': authToken },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should allow mutating request with valid auth token', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
      method: 'POST',
      url: '/api/notes',
      headers: { 'x-papyrus-token': authToken },
      payload: { title: 'Test' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('should reject GET /api/providers and /api/export without token', async () => {
    for (const url of ['/api/providers', '/api/export']) {
      const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
        method: 'GET',
        url,
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('should reject GET /api/mcp/cards without token', async () => {
    const response = await (app as { inject: (opts: unknown) => Promise<{ statusCode: number }> }).inject({
      method: 'GET',
      url: '/api/mcp/cards',
    });
    expect(response.statusCode).toBe(401);
  });
});
