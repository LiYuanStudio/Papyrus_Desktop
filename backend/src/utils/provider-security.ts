import { isPrivateNetworkUrl } from './security.js';
import { isKeylessProvider } from '../api/routes/ai-common.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// 判断 provider base URL 是否允许保存或发起请求，返回错误信息或 null。
// 原因：本地类 provider 仅应访问本机服务，远程 provider 必须阻断私网 SSRF。
// 未在路由内联判断：集中校验可避免 ai-config、providers、provider.ts 规则漂移。
export function validateProviderBaseUrl(baseUrl: string, providerType: string): string | null {
  if (!baseUrl.trim()) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return '无效的 Base URL';
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return 'Base URL 仅支持 http 或 https';
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isKeylessProvider(providerType)) {
    if (!LOCAL_HOSTS.has(hostname)) {
      return '本地服务商仅允许 localhost 或 127.0.0.1';
    }
    return null;
  }

  if (isPrivateNetworkUrl(baseUrl)) {
    return 'SSRF: 禁止配置私有网络地址';
  }

  return null;
}

// 将 API Key 脱敏为仅保留后四位的占位串，供设置页展示已配置状态。
// 原因：读接口不能回传明文 key，但仍需让前端区分“未配置”和“已配置”。
// 未返回空串：空串无法区分“用户主动清空”和“已有密钥被隐藏”。
export function maskApiKeyForDisplay(encryptedKeyPresent: boolean, decryptedKey?: string): { key: string; hasKey: boolean } {
  if (!encryptedKeyPresent) {
    return { key: '', hasKey: false };
  }
  if (decryptedKey && decryptedKey.length >= 4) {
    return { key: '*'.repeat(Math.max(decryptedKey.length - 4, 4)) + decryptedKey.slice(-4), hasKey: true };
  }
  return { key: '********', hasKey: true };
}

// 判断客户端提交的是脱敏占位 key 还是用户新输入的明文 key。
// 原因：更新 provider 时若把占位串写回数据库，会破坏已保存密钥。
// 未用空串判断：空串可能表示“保留原值”或“删除密钥”，需结合 hasKey 语义。
export function isMaskedApiKeySubmission(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) {
    return true;
  }
  return /^\*+[A-Za-z0-9]{0,4}$/.test(trimmed);
}
