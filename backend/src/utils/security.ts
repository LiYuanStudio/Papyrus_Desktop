import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

// 解析安全检查使用的真实路径，返回目标路径或不可解析时的绝对路径。
// 原因：文件可能经过 symlink/junction 指向外部目录，真实路径才能表达实际访问边界。
// 未直接使用原始字符串：字符串路径无法识别链接跳转，容易产生目录绕过。
export function resolveRealPathForSecurity(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

// 判断目标路径是否位于允许目录内，输入为任意文件或目录路径。
// 原因：文件预览、下载、删除和日志目录配置都需要同一套边界判断。
// 未使用 startsWith：不同大小写、路径分隔符和链接解析会让前缀比较产生误判。
export function isPathInsideDirectory(targetPath: string, allowedDirectory: string): boolean {
  const realTarget = resolveRealPathForSecurity(targetPath);
  const realAllowed = resolveRealPathForSecurity(allowedDirectory);
  const relative = path.relative(realAllowed, realTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// 校验路径边界并返回真实路径，失败时抛出调用方指定的错误信息。
// 原因：写入和删除路径需要 fail closed，避免调用方忘记检查布尔返回值。
// 未返回 null：抛错能保留现有异常处理链路，并避免误把 null 拼接成路径。
export function assertPathInsideDirectory(targetPath: string, allowedDirectory: string, message: string): string {
  const realTarget = resolveRealPathForSecurity(targetPath);
  if (!isPathInsideDirectory(realTarget, allowedDirectory)) {
    throw new Error(message);
  }
  return realTarget;
}

// 规范化 IPv6 hostname，输出去掉方括号的小写地址字符串。
// 原因：URL.hostname 在不同 IPv6 表示下可能包含方括号，需要统一后匹配。
// 未做完整 DNS 解析：当前控制只负责字面量私网地址，避免网络副作用。
function normalizeIpv6Host(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

// 判断 IPv4 字面量是否属于本地、私网、链路本地或非标准编码形式。
// 原因：SSRF 防护必须覆盖短写、十进制、十六进制和八进制绕过。
// 未依赖 URL 规范化结果：WHATWG URL 不会替我们拦截全部非标准私网写法。
function isPrivateIpv4(hostname: string): boolean {
  if (/^\d+$/.test(hostname)) return true;
  if (/^0x[0-9a-f]+$/i.test(hostname)) return true;
  if (/^127(\.\d+){1,3}$/.test(hostname)) return true;
  const segments = hostname.split('.');
  if (segments.length >= 2 && segments.length <= 4) {
    const hasNonDecimalSegment = segments.some(seg => /^0x[0-9a-f]+$/i.test(seg) || /^0\d+$/.test(seg));
    if (hasNonDecimalSegment) return true;
  }
  return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|0\.)/.test(hostname);
}

// 判断 IPv6 字面量是否属于本地、链路本地、ULA 或 IPv4-mapped 私网地址。
// 原因：云元数据和本地服务也可经 IPv6 映射地址访问。
// 未只判断 ::1：fe80/fc00/fd00 和 ::ffff 映射同样能绕过本地边界。
function isPrivateIpv6(hostname: string): boolean {
  const normalized = normalizeIpv6Host(hostname);
  if (normalized === '::1') return true;
  if (normalized.startsWith('fe80:')) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (/^[0-9a-f]+:[0-9a-f]+$/i.test(mapped)) {
      const [high, low] = mapped.split(':');
      const highValue = Number.parseInt(high ?? '', 16);
      const lowValue = Number.parseInt(low ?? '', 16);
      if (Number.isFinite(highValue) && Number.isFinite(lowValue)) {
        const ipv4 = [
          (highValue >> 8) & 0xff,
          highValue & 0xff,
          (lowValue >> 8) & 0xff,
          lowValue & 0xff,
        ].join('.');
        return isPrivateIpv4(ipv4) || ipv4.startsWith('127.') || ipv4 === '0.0.0.0';
      }
    }
    return isPrivateIpv4(mapped) || mapped.startsWith('127.') || mapped === '0.0.0.0';
  }
  return false;
}

// 判断 URL 的 hostname 是否指向私有网络地址，返回 true 表示应阻止。
// 原因：AI provider base URL 和补全接口共享同一 SSRF 边界。
// 未在每个调用点重复实现：集中实现能减少 IPv4/IPv6 绕过修复遗漏。
export function isPrivateNetworkUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();
    if (['localhost', '0.0.0.0'].includes(hostname)) return true;
    if (net.isIP(hostname) === 6 || hostname.startsWith('[')) {
      return isPrivateIpv6(hostname);
    }
    return isPrivateIpv4(hostname);
  } catch {
    return false;
  }
}

// 返回可信域名上的 http/https URL，不可信或非法 URL 返回 null。
// 原因：更新检查会把远端 URL 交给前端展示，必须避免 file/javascript/恶意域名。
// 未只校验协议：HTTPS 恶意域名仍可能诱导下载安装非官方文件。
export function safeExternalUrlOrNull(rawUrl: string, allowedDomains: readonly string[]): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.toLowerCase();
    const allowed = allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    return allowed ? parsed.toString() : null;
  } catch {
    return null;
  }
}
