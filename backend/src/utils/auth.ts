import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { paths } from './paths.js';

const TOKEN_FILE = path.join(paths.dataDir, '.api_token');

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function readTokenFile(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }
  } catch (e) {
    console.error(`读取认证令牌文件失败: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

function writeTokenFile(token: string): void {
  try {
    fs.mkdirSync(paths.dataDir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    if (process.platform === 'win32') {
      try { fs.chmodSync(TOKEN_FILE, 0o600); } catch { /* Windows may not fully support chmod */ }
    }
  } catch (e) {
    console.error(`写入认证令牌文件失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function getOrCreateAuthToken(): string {
  const envToken = process.env.PAPYRUS_AUTH_TOKEN;
  if (envToken && envToken.length >= 32) {
    return envToken;
  }
  const fileToken = readTokenFile();
  if (fileToken && fileToken.length >= 32) {
    return fileToken;
  }
  const newToken = generateToken();
  writeTokenFile(newToken);
  return newToken;
}

export function getAuthToken(): string | null {
  const envToken = process.env.PAPYRUS_AUTH_TOKEN;
  if (envToken && envToken.length >= 32) {
    return envToken;
  }
  return readTokenFile();
}

export function isAuthEnabled(): boolean {
  return !!getAuthToken();
}

// 判断请求是否属于无需认证的公开端点（仅健康检查）。
// 原因：桌面应用仍需探活，但其余读写接口都必须绑定本地 token。
// 未放行 OPTIONS 以外的 GET：此前 GET 豁免导致 API Key 与笔记可被任意本机进程读取。
export function isPublicApiPath(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? url;
  return pathOnly === '/api/health';
}

// 从请求头或受控 query 参数提取认证 token。
// 原因：<img>/window.open 无法自定义 Header，文件预览需支持 access_token 查询参数。
// 未对所有路由开放 query token：仅在文件媒体路由的认证钩子里调用，缩小泄露面。
export function extractRequestToken(
  headerToken: string | string[] | undefined,
  queryAccessToken?: string,
): string | undefined {
  if (typeof headerToken === 'string') {
    return headerToken;
  }
  if (Array.isArray(headerToken) && typeof headerToken[0] === 'string') {
    return headerToken[0];
  }
  if (typeof queryAccessToken === 'string' && queryAccessToken.length > 0) {
    return queryAccessToken;
  }
  return undefined;
}

// 文件预览/缩略图/下载允许通过 query 携带 token，供无法设置 Header 的媒体标签使用。
export function allowsQueryTokenAuth(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? url;
  return /^\/api\/files\/[^/]+\/(preview|thumbnail|download)$/.test(pathOnly);
}

export function validateRequestToken(headerToken?: string): boolean {
  const expected = getAuthToken();
  if (!expected) {
    return true;
  }
  if (!headerToken) {
    return false;
  }
  const bufA = Buffer.from(headerToken, 'utf8');
  const bufB = Buffer.from(expected, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// 服务启动时确保本地 API token 存在，避免“未配置 token = 认证关闭”。
// 原因：开发脚本常单独启动后端，必须自动生成并持久化 token。
// 未强制依赖 Electron 注入：Electron 仍可覆盖 env token，但 standalone 后端也默认受保护。
export function ensureAuthToken(): string {
  return getOrCreateAuthToken();
}
