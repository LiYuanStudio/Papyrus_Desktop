import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
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
    expect(catalog.categories.cli).toEqual(['cli_status', 'cli_install', 'cli_run']);

    const status = await executeMcpTool('cli_status', {}, undefined, manager);
    expect(status.success).toBe(true);
    expect(status.installed).toBe(true);
  });
});
