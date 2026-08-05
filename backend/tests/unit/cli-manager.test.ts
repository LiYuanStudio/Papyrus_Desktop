import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { CliManager } from '../../src/cli/cli-manager.js';
import { executeMcpTool, getMcpToolsCatalog } from '../../src/mcp/tools.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-cli-manager-'));
}

function createBundledJsCli(workDir: string): string {
  const cliPath = path.join(workDir, 'papyrus-cli.js');
  fs.writeFileSync(
    cliPath,
    [
      'const base = process.env.PAPYRUS_API_URL ?? "http://127.0.0.1:8000/api";',
      'const normalized = base.endsWith("/api") ? base : `${base}/api`;',
      'const response = await fetch(`${normalized}/health`);',
      'const health = await response.json();',
      'process.stdout.write(JSON.stringify({ success: true, apiBase: normalized, health }) + "\\n");',
    ].join('\n'),
    'utf8',
  );
  return cliPath;
}

function startHealthServer(): Promise<{ server: http.Server; apiUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === '/api/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ success: false, error: 'not found' }));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('failed to bind test server'));
        return;
      }
      resolve({
        server,
        apiUrl: `http://127.0.0.1:${address.port}/api`,
      });
    });
  });
}

describe('CliManager', () => {
  it('reports bundled CLI as available without npm download', async () => {
    const manager = new CliManager({ rootDir: makeTempDir() });
    const status = await manager.getStatus();

    expect(status.success).toBe(true);
    expect(status.installed).toBe(true);
    expect(status.source).toBe('bundled');
    expect(status.updateAvailable).toBe(false);
    expect(status.path).toContain('papyrus-cli');
  });

  it('writes a manifest that points at the bundled CLI', async () => {
    const rootDir = makeTempDir();
    const manager = new CliManager({ rootDir });
    const installResult = await manager.install();

    expect(installResult.success).toBe(true);
    expect(installResult.source).toBe('bundled');
    expect(fs.existsSync(installResult.path)).toBe(true);

    const manifest = manager.readManifest();
    expect(manifest?.source).toBe('bundled');
    expect(manifest?.executablePath).toBe(installResult.path);
  });

  const runCliTest = process.platform === 'win32' ? it.skip : it;

  runCliTest('runs the bundled CLI against the Desktop API contract', async () => {
    const { server, apiUrl } = await startHealthServer();
    const rootDir = makeTempDir();
    const manager = new CliManager({
      rootDir,
      builtinEntryPath: createBundledJsCli(rootDir),
    });

    try {
      const runResult = await manager.run(['status', '--json'], {
        PAPYRUS_API_URL: apiUrl,
      });

      expect(runResult.success).toBe(true);
      const parsedStdout = JSON.parse(runResult.stdout) as {
        success: boolean;
        apiBase: string;
        health: { status: string };
      };
      expect(parsedStdout.success).toBe(true);
      expect(parsedStdout.apiBase).toBe(apiUrl);
      expect(parsedStdout.health.status).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it('exposes CLI tools through MCP catalog and executes cli_status', async () => {
    const manager = new CliManager({
      rootDir: makeTempDir(),
    });

    const catalog = getMcpToolsCatalog();
    expect(catalog.categories.cli).toEqual(['cli_status', 'cli_install']);
    expect(catalog.tools).not.toContain('cli_run');

    const blocked = await executeMcpTool('cli_run', { args: ['status'] }, undefined, manager);
    expect(blocked.success).toBe(false);
    expect(String(blocked.error)).toContain('未知工具');

    const status = await executeMcpTool('cli_status', {}, undefined, manager);
    expect(status.success).toBe(true);
    expect(status.installed).toBe(true);
  });

  it('dispatches bundled CLI commands through real Desktop API request contracts', async () => {
    const originalFetch = global.fetch;
    const originalApiUrl = process.env.PAPYRUS_API_URL;
    const originalAuthToken = process.env.PAPYRUS_AUTH_TOKEN;
    const requests: Array<{ url: string; method: string; headers: Headers; body: string }> = [];
    const workDir = makeTempDir();
    const cardsFile = path.join(workDir, 'cards.txt');
    const dataFile = path.join(workDir, 'data.json');
    const extensionFile = path.join(workDir, 'extension.zip');
    fs.writeFileSync(cardsFile, 'Question === Answer', 'utf8');
    fs.writeFileSync(dataFile, JSON.stringify({ cards: [], notes: [] }), 'utf8');
    fs.writeFileSync(extensionFile, Buffer.from('zip-content'));
    process.env.PAPYRUS_API_URL = 'http://127.0.0.1:43123/';
    process.env.PAPYRUS_AUTH_TOKEN = 'cli-contract-token';

    global.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : '';
      requests.push({ url, method, headers, body });
      if (url.endsWith('/cards/bad')) {
        return new Response(JSON.stringify({ error: 'missing card' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, url, method, body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    try {
      const {
        executeCommand,
        normalizeApiBase,
        parseFlags,
        stripFlags,
      } = await import('../../src/cli/papyrus-cli.js');

      expect(normalizeApiBase('http://127.0.0.1:9000///')).toBe('http://127.0.0.1:9000/api');
      expect(parseFlags(['--json', '--tags', 'one,two', '--params', '{"scope":"today"}'])).toEqual({
        json: true,
        values: { tags: 'one,two' },
        params: { scope: 'today' },
      });
      expect(stripFlags(['card', 'list', '--json', '--tags', 'one'])).toEqual(['card', 'list']);
      expect(() => parseFlags(['--params'])).toThrow('--params 需要提供 JSON 字符串');
      expect(() => parseFlags(['--params', '[]'])).toThrow('--params 必须是 JSON 对象');
      expect(() => parseFlags(['--name'])).toThrow('--name 需要提供值');

      const status = await executeCommand(['status', '--json']);
      expect(status).toEqual(expect.objectContaining({
        success: true,
        cli: 'bundled',
        apiBase: 'http://127.0.0.1:43123/api',
        json: true,
      }));
      expect(requests[0]).toEqual(expect.objectContaining({
        url: 'http://127.0.0.1:43123/api/health',
        method: 'GET',
      }));
      expect(requests[0]?.headers.get('X-Papyrus-Token')).toBe('cli-contract-token');

      await executeCommand(['cards', 'list']);
      await executeCommand(['card', 'show', 'card id']);
      await executeCommand(['card', 'add', 'Question', 'Answer', '--tags', 'alpha,beta']);
      await executeCommand(['card', 'edit', 'card-1', '--question', 'Updated', '--tags', 'alpha']);
      await executeCommand(['card', 'delete', 'card-1']);
      await executeCommand(['card', 'search', 'spaced query']);
      await executeCommand(['card', 'import', cardsFile]);
      await executeCommand(['card', 'export']);
      await executeCommand(['card', 'due']);
      await executeCommand(['review']);
      await executeCommand(['stats']);
      await executeCommand(['review', 'summary']);
      await executeCommand(['review', 'rate', 'card-1', '--grade', '3']);
      await executeCommand(['files', 'list']);
      await executeCommand(['ext', 'list']);
      await executeCommand(['ext', 'install', extensionFile]);
      await executeCommand(['mcp', 'tools']);
      await executeCommand(['mcp', 'call', 'read_data_stats', '--params', '{"scope":"today"}']);
      await executeCommand(['data', 'backup']);
      await executeCommand(['data', 'export']);
      await executeCommand(['data', 'import', dataFile]);
      await executeCommand(['data', 'stats']);

      expect(requests.map(request => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
        'GET /api/health',
        'GET /api/cards',
        'GET /api/cards/card%20id',
        'POST /api/cards',
        'PATCH /api/cards/card-1',
        'DELETE /api/cards/card-1',
        'GET /api/search',
        'POST /api/cards/import/txt',
        'GET /api/cards',
        'GET /api/review/next',
        'GET /api/review/next',
        'POST /api/mcp/call',
        'POST /api/mcp/call',
        'POST /api/review/card-1/rate',
        'GET /api/files',
        'GET /api/extensions',
        'POST /api/extensions/install-local',
        'GET /api/mcp/tools',
        'POST /api/mcp/call',
        'POST /api/backup',
        'GET /api/export',
        'POST /api/import',
        'POST /api/mcp/call',
      ]);
      expect(JSON.parse(requests[3]?.body ?? '{}')).toEqual({
        q: 'Question',
        a: 'Answer',
        tags: ['alpha', 'beta'],
      });
      expect(JSON.parse(requests[18]?.body ?? '{}')).toEqual({
        tool: 'read_data_stats',
        params: { scope: 'today' },
      });

      await expect(executeCommand(['card', 'show', 'bad'])).rejects.toThrow('missing card');
      await expect(executeCommand(['review', 'rate', 'card-1', '--grade', '4']))
        .rejects.toThrow('--grade 必须是 1、2 或 3');
      await expect(executeCommand(['stop'])).rejects.toThrow('不支持');
      await expect(executeCommand(['unknown'])).rejects.toThrow('未知命令');
      expect(await executeCommand(['serve'])).toEqual(expect.objectContaining({ success: true }));
      expect(await executeCommand(['docs'])).toEqual(expect.objectContaining({
        docs: 'http://127.0.0.1:43123/api/health',
      }));
      expect(await executeCommand(['config'])).toEqual(expect.objectContaining({
        config: expect.objectContaining({ apiUrl: 'http://127.0.0.1:43123/api' }),
      }));
      expect(await executeCommand(['quickstart'])).toEqual(expect.objectContaining({
        steps: expect.arrayContaining(['papyrus status']),
      }));
    } finally {
      global.fetch = originalFetch;
      if (originalApiUrl === undefined) delete process.env.PAPYRUS_API_URL;
      else process.env.PAPYRUS_API_URL = originalApiUrl;
      if (originalAuthToken === undefined) delete process.env.PAPYRUS_AUTH_TOKEN;
      else process.env.PAPYRUS_AUTH_TOKEN = originalAuthToken;
    }
  });});
