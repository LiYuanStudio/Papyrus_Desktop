import http from 'node:http';
import { MCPServer, resolveMcpPort } from '../../src/mcp/server.js';

function makeRequest(port: number, path: string, options: http.RequestOptions & { body?: string } = {}): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe('MCPServer', () => {
  let server: MCPServer;

  afterEach(() => {
    server?.stop();
  });

  it('should resolve an isolated MCP port from the environment', () => {
    expect(resolveMcpPort('28402')).toBe(28402);
    expect(resolveMcpPort('0')).toBe(9200);
    expect(resolveMcpPort('not-a-port')).toBe(9200);
  });

  it('should expose auth token', () => {
    server = new MCPServer({ port: 0, authToken: 'test-token' });
    expect(server.getAuthToken()).toBe('test-token');
  });

  it('should generate auth token when not provided', () => {
    server = new MCPServer({ port: 0 });
    expect(server.getAuthToken()).toBeTruthy();
    expect(server.getAuthToken().length).toBeGreaterThan(0);
  });

  it('should respond to health check', async () => {
    server = new MCPServer({ port: 0, authToken: 'test-token' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/health');
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).status).toBe('ok');
  });

  it('should list tools with valid auth', async () => {
    server = new MCPServer({ port: 0, authToken: 'test-token' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/tools', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(Array.isArray(body.tools)).toBe(true);
    expect(Array.isArray((body.categories as Record<string, unknown>).cards)).toBe(true);
  });

  it('should reject unauthenticated tools listing', async () => {
    server = new MCPServer({ port: 0, authToken: 'test-token' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/tools');
    expect(res.status).toBe(401);
  });

  it('should reject unauthorized call', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_card_stats', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('should execute card tool with valid auth', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: JSON.stringify({ tool: 'get_card_stats', params: {} }),
    });
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
  });

  it('should handle CORS preflight', async () => {
    server = new MCPServer({ port: 0, authToken: 'test' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
  });

  it('should handle invalid origin in CORS preflight', async () => {
    server = new MCPServer({ port: 0, authToken: 'test' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/health', {
      method: 'OPTIONS',
      headers: { Origin: 'not-a-valid-url' },
    });
    expect(res.status).toBe(204);
  });

  it('should resolve immediately if already started', async () => {
    server = new MCPServer({ port: 0, authToken: 'test' });
    await server.start();
    await expect(server.start()).resolves.toBeUndefined();
  });

  it('should return 404 for unknown path', async () => {
    server = new MCPServer({ port: 0, authToken: 'test' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/unknown');
    expect(res.status).toBe(404);
  });

  it('should drain a POST body before returning 404 for an unknown path', async () => {
    server = new MCPServer({ port: 0, authToken: 'test' });
    await server.start();
    const port = server.getActualPort();
    const body = JSON.stringify({ tool: 'ignored', payload: 'x'.repeat(64 * 1024) });

    const res = await makeRequest(port, '/unknown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });

    expect(res.status).toBe(404);
    expect((res.body as Record<string, unknown>).error).toBe('未知路径');
  });

  it('should reject invalid JSON body', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  it('should reject non-object body', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: '123',
    });
    expect(res.status).toBe(400);
  });

  it('should reject missing tool field', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ params: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('should execute vault_read tool', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ tool: 'vault_read', params: { ids: [] } }),
    });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).success).toBe(true);
  });

  it('should return error for unknown vault tool', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ tool: 'vault_watch', params: {} }),
    });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).success).toBe(false);
  });

  it('should execute vault_index tool', async () => {
    server = new MCPServer({ port: 0, authToken: 'secret' });
    await server.start();
    const port = server.getActualPort();

    const res = await makeRequest(port, '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ tool: 'vault_index', params: {} }),
    });
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>).success).toBe(true);
    expect(Array.isArray((res.body as Record<string, unknown>).notes)).toBe(true);
  });
});
