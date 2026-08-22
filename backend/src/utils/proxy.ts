import { execFileSync, execSync } from 'node:child_process';
import dns from 'node:dns';
import type net from 'node:net';
import { fetch as undiciFetch, Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import { isLoopbackAddress, isPrivateResolvedAddress, isPrivateNetworkUrl } from './security.js';

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

// SSRF 连接期校验：在 undici connect.lookup 回调里检查 DNS 解析结果。
// 原因：字面量校验存在两类绕过——域名解析到私网 IP（DNS rebinding）、
//       以及 fetch 默认 redirect:'follow' 被 302 跳转到内网地址。
//       lookup 发生在实际建连之前，校验通过才允许 connect，无 TOCTOU 窗口。
// 未在请求前做一次性 dns.lookup 预检：预检与真实连接之间仍可换解析记录，防不住 rebinding。
type SsrfLookupCallback = (
  err: NodeJS.ErrnoException | null,
  addresses: dns.LookupAddress[] | dns.LookupAddress,
) => void;

function createSsrfGuardLookup(allowLoopback: boolean): net.LookupFunction {
  const guarded = (
    hostname: string,
    options: dns.LookupOneOptions | dns.LookupAllOptions,
    callback: SsrfLookupCallback,
  ): void => {
    // all: true 保证拿到全部解析地址（IPv4+IPv6），逐条校验防止只查首个记录被绕过。
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) {
        callback(err, []);
        return;
      }
      const blocked = addresses.find(
        entry => isPrivateResolvedAddress(entry.address)
          && !(allowLoopback && isLoopbackAddress(entry.address)),
      );
      if (blocked) {
        callback(
          new Error(`SSRF 防护：${hostname} 解析到受限网络地址 ${blocked.address}，已拒绝连接`),
          [],
        );
        return;
      }
      callback(null, addresses);
    });
  };
  // 类型断言说明：node:net 的 LookupFunction 只描述了单地址回调形态
  // （callback(address: string, family)），但 options.all=true 时 dns.lookup 的回调
  // 实际收到 LookupAddress[]——这是 Node 类型定义无法表达的双形态，运行时由 net/tls
  // 按 all 选项正确分发。此处断言仅为通过编译，行为以 dns.lookup 的 all 语义为准。
  return guarded as unknown as net.LookupFunction;
}

// 按需创建并复用的共享 Agent：本地 Provider 场景（允许回环）。
// 原因：Agent 内部持有连接池，复用可避免每次请求重建 TLS 会话。
// 全局挂载而非仅在 fetchWithProxy 内传 dispatcher：
// 原因：SSRF 连接期校验必须覆盖默认 fetch 路径（global.fetch），只装在包装函数里
//       会让进程内其他 fetch 调用点绕过校验；setGlobalDispatcher 对 global.fetch 同样生效。
// 为何允许回环：本服务是本机桌面组件，CLI/健康检查/本地 Provider 需要合法访问回环地址；
//       私网（10/172.16/192.168/169.254）、链路本地与 ULA 仍会被拒绝。
// 非本地 Provider 禁止回环的要求由 fetchWithProxy 的字面量预检 + 上层 validateProviderBaseUrl 保证。
let loopbackAllowedAgent: Agent | undefined;

function getLoopbackAllowedAgent(): Agent {
  if (!loopbackAllowedAgent) {
    loopbackAllowedAgent = new Agent({ connect: { lookup: createSsrfGuardLookup(true) } });
  }
  return loopbackAllowedAgent;
}

setGlobalDispatcher(getLoopbackAllowedAgent());

export interface SecureFetchOptions {
  // 仅 keyless 本地 Provider（Ollama/LM Studio 等）允许回环地址；
  // 即使为 true，私网（10/172.16/192.168/169.254）与 ULA 仍被全局 dispatcher 拒绝。
  allowLoopback?: boolean;
}

export async function fetchWithProxy(url: string, init?: RequestInit, opts?: SecureFetchOptions): Promise<Response> {
  // 非本地目标的字面量预检：本地 Provider 之外的调用禁止回环/私网字面量地址，
  // 与全局 dispatcher 的解析期校验形成两层防线（字面量在发请求前就拒绝，错误信息更明确）。
  if (!opts?.allowLoopback && isPrivateNetworkUrl(url)) {
    throw new Error(`SSRF 防护：禁止访问受限网络地址 ${url}`);
  }

  // 强制 redirect:'error'：公网 base URL 通过校验后仍可能 302 跳内网，跟随重定向会绕过字面量校验。
  // 放在 init 展开之后覆盖，调用方无法放宽；需要重定向的场景目前不存在，失败信息由 fetch 直接抛出。
  const hardenedInit: RequestInit = { ...init, redirect: 'error' };

  const proxyUrl = getProxyUrl();
  if (proxyUrl && isGitHubUrl(url)) {
    const proxyAgent = createProxyAgent();
    if (proxyAgent) {
      try {
        return await undiciFetch(
          url,
          { ...hardenedInit, dispatcher: proxyAgent } as unknown as Parameters<typeof undiciFetch>[1],
        ) as unknown as Response;
      } catch (error) {
        if (!isProxyConnectionError(error)) {
          throw error;
        }
        try {
          // 直连回退经 global.fetch 走全局受保护 dispatcher，GitHub 域名不受回环预检影响。
          return await global.fetch(url, withTimeoutSignal(hardenedInit, GITHUB_DIRECT_FALLBACK_TIMEOUT_MS));
        } catch (directError) {
          const reason = directError instanceof Error ? directError.message : String(directError);
          throw new Error(`通过代理 ${proxyUrl} 连接失败，已尝试直连仍失败：${reason}`);
        }
      }
    }
  }

  return global.fetch(url, hardenedInit);
}
