import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import { fetchWithProxy } from '../../utils/proxy.js';
import { safeExternalUrlOrNull } from '../../utils/security.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json');
const CURRENT_VERSION: string = pkg.version;
const REPO = 'PapyrusOR/Papyrus_Desktop';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
  assets: Array<{ browser_download_url: string }>;
}

interface UpdateCheckResponse {
  success: boolean;
  data: {
    current_version: string;
    latest_version: string;
    has_update: boolean;
    release_url: string;
    download_url: string;
    release_notes: string | null;
    published_at: string | null;
  } | null;
  message: string;
}

// 更新产物支持的桌面平台集合，输入来自校验后的可信请求头，输出用于筛选 Release 资产。
// 原因：显式联合类型避免把浏览器提供的任意字符串带入平台分支。
// 未使用 NodeJS.Platform：更新接口只发布三类桌面安装包，不应接受其他 Node 平台值。
type UpdatePlatform = 'darwin' | 'linux' | 'win32';

// 当前发布流水线支持的 CPU 架构，输入来自 Electron 主进程，输出用于 DMG/安装器名称匹配。
// 原因：限制为 arm64/x64 可防止返回未构建或无法执行的 Release 资产。
// 未使用 string：任意架构字符串会让筛选静默回退到错误安装包。
type UpdateArchitecture = 'arm64' | 'x64';

function isGitHubRelease(value: unknown): value is GitHubRelease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag_name' in value &&
    typeof (value as Record<string, unknown>).tag_name === 'string'
  );
}

/** GitHub API 镜像源，按优先级排列 */
const GITHUB_API_ENDPOINTS = [
  `https://api.github.com/repos/${REPO}/releases/latest`,
  `https://gh.api.99988866.xyz/repos/${REPO}/releases/latest`,
  `https://api.mgithub.com/repos/${REPO}/releases/latest`,
];

const FETCH_TIMEOUT_MS = 10000;
const TRUSTED_RELEASE_DOMAINS = ['github.com', 'githubusercontent.com'];
const FALLBACK_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * 将可信主进程注入的请求头收窄为支持的平台和架构。
 * 原因：更新 API 也可从普通浏览器访问，所有 header 都必须视为不可信字符串并提供 undefined 回退。
 * 未直接断言联合类型：运行时校验可防止任意值影响安装包筛选逻辑。
 */
function readUpdateTarget(
  platformHeader: string | string[] | undefined,
  archHeader: string | string[] | undefined,
): { arch?: UpdateArchitecture; platform?: UpdatePlatform } {
  const rawPlatform = Array.isArray(platformHeader) ? platformHeader[0] : platformHeader;
  const rawArch = Array.isArray(archHeader) ? archHeader[0] : archHeader;
  const platform = rawPlatform === 'darwin' || rawPlatform === 'linux' || rawPlatform === 'win32'
    ? rawPlatform
    : undefined;
  const arch = rawArch === 'arm64' || rawArch === 'x64' ? rawArch : undefined;
  return { arch, platform };
}

/**
 * 从 GitHub Release 资产中选出与当前平台和 CPU 架构匹配的安装包 URL。
 * 原因：assets[0] 常是 Windows 安装器，macOS 用户必须优先得到对应 arm64/x64 的 DMG。
 * 未按数组顺序盲选：Release 上传顺序不稳定，且不同平台产物会在并行 CI 中以不同顺序出现。
 */
export function selectReleaseAssetUrl(
  assets: GitHubRelease['assets'],
  platform?: UpdatePlatform,
  arch?: UpdateArchitecture,
): string | undefined {
  if (!platform) {
    return assets[0]?.browser_download_url;
  }

  const platformAssets = assets.filter((asset) => {
    const normalizedUrl = asset.browser_download_url.toLowerCase();
    if (platform === 'darwin') {
      return normalizedUrl.endsWith('.dmg');
    }
    if (platform === 'win32') {
      return normalizedUrl.endsWith('.exe');
    }
    return normalizedUrl.endsWith('.appimage') || normalizedUrl.endsWith('.deb');
  });

  if (platformAssets.length === 0) {
    return undefined;
  }
  if (!arch) {
    return platformAssets[0]?.browser_download_url;
  }

  const architectureTokens = arch === 'arm64'
    ? ['arm64', 'apple-silicon']
    : ['x64', 'intel'];
  const architectureMatch = platformAssets.find((asset) => {
    const normalizedUrl = asset.browser_download_url.toLowerCase();
    return architectureTokens.some((token) => normalizedUrl.includes(token));
  });
  return architectureMatch?.browser_download_url ?? platformAssets[0]?.browser_download_url;
}

async function fetchReleaseFromEndpoint(url: string): Promise<GitHubRelease> {
  const res = await fetchWithProxy(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': `Papyrus-Desktop/${CURRENT_VERSION}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const rawData: unknown = await res.json();
  if (!isGitHubRelease(rawData)) {
    throw new Error('Invalid response format');
  }
  return rawData;
}

async function fetchReleaseWithFallback(): Promise<GitHubRelease> {
  let lastError: Error | undefined;

  for (const url of GITHUB_API_ENDPOINTS) {
    try {
      const release = await fetchReleaseFromEndpoint(url);
      return release;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Update] Failed to fetch from ${url}: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error('All GitHub API endpoints failed');
}

export default async function updateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/check', async (request, reply) => {
    try {
      const rawData = await fetchReleaseWithFallback();
      const target = readUpdateTarget(
        request.headers['x-papyrus-platform'],
        request.headers['x-papyrus-arch'],
      );

      const latest = rawData.tag_name;
      const hasUpdate = latest !== CURRENT_VERSION;
      const releaseUrl = safeExternalUrlOrNull(rawData.html_url, TRUSTED_RELEASE_DOMAINS) ?? FALLBACK_RELEASE_URL;
      const selectedAssetUrl = selectReleaseAssetUrl(rawData.assets, target.platform, target.arch);
      const downloadUrl = safeExternalUrlOrNull(selectedAssetUrl ?? '', TRUSTED_RELEASE_DOMAINS) ?? releaseUrl;

      reply.send({
        success: true,
        data: {
          current_version: CURRENT_VERSION,
          latest_version: latest,
          has_update: hasUpdate,
          release_url: releaseUrl,
          download_url: downloadUrl,
          release_notes: rawData.body,
          published_at: rawData.published_at,
        },
        message: hasUpdate ? 'Update available' : 'You are up to date',
      } satisfies UpdateCheckResponse);
    } catch (error) {
      const isTimeout = error instanceof Error && (
        error.name === 'TimeoutError' || error.message.includes('timeout')
      );
      const isRestricted = error instanceof Error && error.message.includes('403');

      let errorMessage: string;
      if (isTimeout) {
        errorMessage = '连接 GitHub 超时，请检查网络或代理设置';
      } else if (isRestricted) {
        errorMessage = 'GitHub API 访问受限，请检查网络连接';
      } else {
        errorMessage = '无法连接到 GitHub，请检查网络连接';
      }

      reply.send({ success: false, data: null, message: errorMessage } satisfies UpdateCheckResponse);
    }
  });

  fastify.get('/version', async (_request, reply) => {
    reply.send({ version: CURRENT_VERSION, repository: REPO });
  });
}
