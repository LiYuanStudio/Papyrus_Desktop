import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { executeMcpTool, getMcpToolsCatalog } from '#/mcp/tools.js';
import type { PapyrusLogger } from '../utils/logger.js';

export interface MCPServerOptions {
  host?: string;
  port?: number;
  logger?: PapyrusLogger;
  authToken?: string;
}

/**
 * 将环境变量中的 MCP 端口收窄为有效 TCP 端口。
 * 原因：E2E、并行开发实例和 macOS 调试进程需要避免固定 9200 端口互相争用。
 * 未接受 NaN、浮点数或越界值：无效配置静默回退到稳定默认值比启动到不可监听端口更可靠。
 */
export function resolveMcpPort(rawPort: string | undefined): number {
  if (!rawPort) {
    return 9200;
  }
  const port = Number(rawPort);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 9200;
}

function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

function isAllowedOrigin(origin: string): boolean {
  const allowedPorts = new Set([5173, 4173, 8000, 3000, 9100, 9200]);
  try {
    const parsed = new URL(origin);
    const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
    return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && allowedPorts.has(port);
  } catch {
    return false;
  }
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200, origin?: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin && isAllowedOrigin(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
      : {}),
  });
  res.end(JSON.stringify(data));
}

export class MCPServer {
  private host: string;
  private port: number;
  private logger?: PapyrusLogger;
  private authToken: string;
  private server?: http.Server;

  constructor(options: MCPServerOptions = {}) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? resolveMcpPort(process.env.PAPYRUS_MCP_PORT);
    this.logger = options.logger;
    this.authToken = options.authToken ?? generateToken();
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        resolve();
        return;
      }

      this.server = http.createServer((req, res) => {
        const origin = req.headers.origin ?? '';

        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            ...(isAllowedOrigin(origin)
              ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
              : {}),
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          });
          res.end();
          return;
        }

        if (req.method === 'GET' && req.url === '/health') {
          sendJson(res, { status: 'ok' }, 200, origin);
          return;
        }

        const authHeader = req.headers.authorization ?? '';
        const isAuthorized = authHeader === `Bearer ${this.authToken}`;

        if (req.method === 'GET' && req.url === '/tools') {
          if (!isAuthorized) {
            sendJson(res, { error: 'Unauthorized' }, 401, origin);
            return;
          }
          sendJson(res, getMcpToolsCatalog(), 200, origin);
          return;
        }

        if (req.method !== 'POST' || req.url !== '/call') {
          sendJson(res, { error: '未知路径' }, 404, origin);
          return;
        }

        if (!isAuthorized) {
          sendJson(res, { error: 'Unauthorized' }, 401, origin);
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            sendJson(res, { error: '请求体不是合法 JSON' }, 400, origin);
            return;
          }

          if (parsed === null || typeof parsed !== 'object') {
            sendJson(res, { error: '请求体必须是对象' }, 400, origin);
            return;
          }

          const dict = parsed as Record<string, unknown>;
          const toolName = typeof dict.tool === 'string' ? dict.tool : '';
          const params = typeof dict.params === 'object' && dict.params !== null
            ? dict.params as Record<string, unknown>
            : {};

          if (!toolName) {
            sendJson(res, { error: '缺少 tool 字段' }, 400, origin);
            return;
          }

          console.log(`[mcp] /call ${toolName}`);
          const result = await executeMcpTool(toolName, params, this.logger);
          sendJson(res, result, 200, origin);
        });
      });

      this.server.listen(this.port, this.host, () => {
        this.logger?.info(`MCP 服务器已启动: http://${this.host}:${this.port}`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  getActualPort(): number {
    if (!this.server) return this.port;
    const address = this.server.address();
    if (address && typeof address === 'object') {
      return address.port;
    }
    return this.port;
  }

  stop(): void {
    if (!this.server) return;
    this.server.close(() => {
      this.logger?.info('MCP 服务器已停止');
    });
    this.server = undefined;
  }

  getAuthToken(): string {
    return this.authToken;
  }
}
