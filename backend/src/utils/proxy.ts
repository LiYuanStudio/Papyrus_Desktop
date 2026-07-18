import { execFileSync, execSync } from 'node:child_process';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const GITHUB_DIRECT_FALLBACK_TIMEOUT_MS = 5000;

function getWindowsProxy(): string | undefined {
  try {
    const enabled = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
      { encoding: 'utf-8' },
    );
    const enabledMatch = enabled.match(/ProxyEnable\s+REG_DWORD\s+(0x[\da-fA-F]+)/);
    if (!enabledMatch || !enabledMatch[1] || parseInt(enabledMatch[1], 16) === 0) {
      return undefined;
    }

    const server = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: 'utf-8' },
    );
    const serverMatch = server.match(/ProxyServer\s+REG_SZ\s+(.+)/);
    if (!serverMatch || !serverMatch[1]) {
      return undefined;
    }

    const proxy = serverMatch[1].trim();
    const httpsMatch = proxy.match(/https=([^;]+)/);
    if (httpsMatch) {
      return `http://${httpsMatch[1]}`;
    }
    const httpMatch = proxy.match(/http=([^;]+)/);
    if (httpMatch) {
      return `http://${httpMatch[1]}`;
    }
    if (proxy.includes(':') && !proxy.includes('=')) {
      return `http://${proxy}`;
    }
  } catch {
    // 忽略注册表读取错误
  }
  return undefined;
}

/**
 * 解析 `scutil --proxy` 的当前系统代理字典。
 * 原因：scutil 反映实际生效的网络配置，不依赖 Wi-Fi/Ethernet 服务名称，能兼容本地化系统和 Thunderbolt 等接口。
 * 未逐个调用 networksetup：服务名可由用户修改且会随语言变化，硬编码列表会漏掉常见 macOS 网络环境。
 */
export function parseMacProxyConfiguration(output: string): string | undefined {
  const candidates = [
    { enabledKey: 'HTTPSEnable', hostKey: 'HTTPSProxy', portKey: 'HTTPSPort' },
    { enabledKey: 'HTTPEnable', hostKey: 'HTTPProxy', portKey: 'HTTPPort' },
  ];

  for (const candidate of candidates) {
    const enabledMatch = output.match(new RegExp(`^\\s*${candidate.enabledKey}\\s*:\\s*(\\d+)\\s*$`, 'm'));
    if (enabledMatch?.[1] !== '1') {
      continue;
    }
    const hostMatch = output.match(new RegExp(`^\\s*${candidate.hostKey}\\s*:\\s*(\\S+)\\s*$`, 'm'));
    const portMatch = output.match(new RegExp(`^\\s*${candidate.portKey}\\s*:\\s*(\\d+)\\s*$`, 'm'));
    const host = hostMatch?.[1];
    const port = Number(portMatch?.[1]);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      continue;
    }
    const normalizedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return `http://${normalizedHost}:${port}`;
  }
  return undefined;
}

/**
 * 读取 macOS 当前生效的系统代理。
 * 原因：使用绝对路径和参数数组可绕过 shell，并适配 GUI 应用精简后的 PATH。
 * 未直接执行字符串命令：代理配置是系统输入，execFileSync 能避免额外 shell 解析面。
 */
function getMacProxy(): string | undefined {
  try {
    const output = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf-8' });
    return parseMacProxyConfiguration(output);
  } catch {
    return undefined;
  }
}

export function getProxyUrl(): string | undefined {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
    || process.env.https_proxy || process.env.http_proxy;
  if (envProxy) {
    return envProxy;
  }

  if (process.env.PAPYRUS_DISABLE_SYSTEM_PROXY === '1') {
    return undefined;
  }

  if (process.platform === 'win32') {
    return getWindowsProxy();
  }

  if (process.platform === 'darwin') {
    return getMacProxy();
  }

  return undefined;
}

export function createProxyAgent(): ProxyAgent | undefined {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return undefined;
  }
  try {
    return new ProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

export function isProxyConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Runtime-safe: undici wraps socket-level errors in `cause.code`
  const causeCode = (error as unknown as { cause?: { code?: string } }).cause?.code;
  return (
    error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    causeCode === 'ECONNREFUSED' ||
    causeCode === 'ETIMEDOUT' ||
    causeCode === 'ECONNRESET' ||
    causeCode === 'ECONNABORTED' ||
    causeCode === 'EHOSTUNREACH' ||
    causeCode === 'ENETUNREACH'
  );
}

function isGitHubUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return hostname.endsWith('github.com') || hostname.endsWith('githubusercontent.com');
  } catch {
    return false;
  }
}

function withTimeoutSignal(init: RequestInit | undefined, timeoutMs: number): RequestInit {
  if (init?.signal) {
    return init;
  }
  return { ...init, signal: AbortSignal.timeout(timeoutMs) };
}

export async function fetchWithProxy(url: string, init?: RequestInit): Promise<Response> {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return global.fetch(url, init);
  }

  if (!isGitHubUrl(url)) {
    return global.fetch(url, init);
  }

  const proxyAgent = createProxyAgent();
  if (!proxyAgent) {
    return global.fetch(url, init);
  }

  try {
    return await undiciFetch(
      url,
      { ...init, dispatcher: proxyAgent } as unknown as Parameters<typeof undiciFetch>[1],
    );
  } catch (error) {
    if (!isProxyConnectionError(error)) {
      throw error;
    }
    try {
      return await global.fetch(url, withTimeoutSignal(init, GITHUB_DIRECT_FALLBACK_TIMEOUT_MS));
    } catch (directError) {
      const reason = directError instanceof Error ? directError.message : String(directError);
      throw new Error(`通过代理 ${proxyUrl} 连接失败，已尝试直连仍失败：${reason}`);
    }
  }
}
