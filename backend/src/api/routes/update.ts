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
  draft?: boolean;
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

// 表示经过严格 SemVer 校验的版本，供更新判断逐段比较核心版本和预发布标识符。
// 原因：结构化比较才能正确区分正式版、Beta 版及各自的优先级。
// 未直接比较字符串：字典序会把 beta.10 排在 beta.9 之前，也无法阻止跨主版本降级。
interface ParsedSemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}

function isGitHubRelease(value: unknown): value is GitHubRelease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag_name' in value &&
    typeof (value as Record<string, unknown>).tag_name === 'string'
  );
}

/** GitHub API 镜像源，按优先级排列，路径会根据当前 App 的发布通道动态补充。 */
const GITHUB_API_BASE_URLS = [
  'https://api.github.com',
  'https://gh.api.99988866.xyz',
  'https://api.mgithub.com',
];

const FETCH_TIMEOUT_MS = 10000;
const TRUSTED_RELEASE_DOMAINS = ['github.com', 'githubusercontent.com'];
const FALLBACK_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;

/**
 * 将可选带 v 前缀的版本字符串解析为严格 SemVer 结构，输入非法时返回 null。
 * 原因：远端 tag 属于不可信输入，只有完整匹配 SemVer 才能参与更新决策。
 * 未宽松提取数字：部分匹配可能把畸形或错误 tag 误判为可安装的新版本。
 */
function parseSemVer(version: string): ParsedSemVer | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  const majorText = match?.[1];
  const minorText = match?.[2];
  const patchText = match?.[3];
  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return null;
  }

  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return null;
  }

  const prerelease: Array<number | string> = [];
  const prereleaseText = match?.[4];
  if (prereleaseText !== undefined) {
    for (const identifier of prereleaseText.split('.')) {
      if (/^\d+$/.test(identifier)) {
        if (identifier.length > 1 && identifier.startsWith('0')) {
          return null;
        }
        const numericIdentifier = Number(identifier);
        if (!Number.isSafeInteger(numericIdentifier)) {
          return null;
        }
        prerelease.push(numericIdentifier);
      } else {
        prerelease.push(identifier);
      }
    }
  }

  return { major, minor, patch, prerelease };
}

/**
 * 比较两个已解析 SemVer 版本，返回正数表示 left 更新、负数表示 right 更新、零表示等价。
 * 原因：遵循 SemVer 的数值段和预发布优先级，正式版在相同核心版本下高于预发布版。
 * 未使用 localeCompare 处理整个版本：它不理解数字标识符及正式版/预发布版语义。
 */
function compareSemVer(left: ParsedSemVer, right: ParsedSemVer): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) {
      return difference;
    }
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return right.prerelease.length - left.prerelease.length;
  }

  const identifierCount = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return left.prerelease.length - right.prerelease.length;
    }
    if (leftIdentifier === rightIdentifier) {
      continue;
    }
    if (typeof leftIdentifier === 'number' && typeof rightIdentifier === 'number') {
      return leftIdentifier - rightIdentifier;
    }
    if (typeof leftIdentifier === 'number') {
      return -1;
    }
    if (typeof rightIdentifier === 'number') {
      return 1;
    }
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  return 0;
}

/**
 * 判断远端版本是否严格高于当前版本；任一版本非法时安全地拒绝更新。
 * 原因：更新提示必须单调向前，尤其不能让 Beta 客户端把旧正式版识别为升级。
 * 未采用“不相等即更新”：该判断会被 v 前缀、预发布标签和旧版本触发反向升级。
 */
export function isVersionNewer(latestVersion: string, currentVersion: string): boolean {
  const latest = parseSemVer(latestVersion);
  const current = parseSemVer(currentVersion);
  return latest !== null && current !== null && compareSemVer(latest, current) > 0;
}

/**
 * 为当前 App 版本生成更新源；预发布版读取 Release 列表，正式版读取 GitHub latest。
 * 原因：GitHub 的 latest 接口明确排除 prerelease，Beta App 使用它会错过后续 Beta。
 * 未让所有客户端都读取列表：正式版沿用稳定通道，避免意外向正式用户推荐预发布版本。
 */
function getGitHubApiEndpoints(currentVersion: string): string[] {
  const current = parseSemVer(currentVersion);
  const releasePath = current !== null && current.prerelease.length > 0
    ? 'releases?per_page=30'
    : 'releases/latest';
  return GITHUB_API_BASE_URLS.map((baseUrl) => `${baseUrl}/repos/${REPO}/${releasePath}`);
}

/**
 * 从 Electron 注入的请求头读取当前 App 版本，非法或缺失时回退到后端包版本。
 * 原因：固定端口可能暂时仍由旧后端占用，更新基线应以用户实际启动的 Electron App 为准。
 * 未无条件信任 header：普通浏览器也能调用只读接口，必须先通过严格 SemVer 校验。
 */
function readCurrentAppVersion(versionHeader: string | string[] | undefined): string {
  const rawVersion = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;
  return rawVersion !== undefined && parseSemVer(rawVersion) !== null
    ? rawVersion
    : CURRENT_VERSION;
}

/**
 * 从 GitHub Release 列表选出 SemVer 优先级最高的非草稿版本。
 * 原因：GitHub 列表按发布时间而非版本优先级排序，不能假设第一项就是最高版本。
 * 未只筛选 prerelease：同核心版本的正式版应允许 Beta 用户正常向前升级。
 */
function selectHighestRelease(releases: GitHubRelease[]): GitHubRelease | null {
  let selected: GitHubRelease | null = null;
  let selectedVersion: ParsedSemVer | null = null;

  for (const release of releases) {
    if (release.draft === true) {
      continue;
    }
    const candidateVersion = parseSemVer(release.tag_name);
    if (candidateVersion === null) {
      continue;
    }
    if (selectedVersion === null || compareSemVer(candidateVersion, selectedVersion) > 0) {
      selected = release;
      selectedVersion = candidateVersion;
    }
  }

  return selected;
}

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
  if (Array.isArray(rawData)) {
    const releases = rawData.filter(isGitHubRelease);
    const selectedRelease = selectHighestRelease(releases);
    if (selectedRelease === null) {
      throw new Error('No valid release found');
    }
    return selectedRelease;
  }
  if (!isGitHubRelease(rawData)) {
    throw new Error('Invalid response format');
  }
  return rawData;
}

async function fetchReleaseWithFallback(currentVersion: string): Promise<GitHubRelease> {
  let lastError: Error | undefined;

  for (const url of getGitHubApiEndpoints(currentVersion)) {
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
      const currentVersion = readCurrentAppVersion(request.headers['x-papyrus-app-version']);
      const rawData = await fetchReleaseWithFallback(currentVersion);
      const target = readUpdateTarget(
        request.headers['x-papyrus-platform'],
        request.headers['x-papyrus-arch'],
      );

      const latest = rawData.tag_name;
      const hasUpdate = isVersionNewer(latest, currentVersion);
      const releaseUrl = safeExternalUrlOrNull(rawData.html_url, TRUSTED_RELEASE_DOMAINS) ?? FALLBACK_RELEASE_URL;
      const selectedAssetUrl = selectReleaseAssetUrl(rawData.assets, target.platform, target.arch);
      const downloadUrl = safeExternalUrlOrNull(selectedAssetUrl ?? '', TRUSTED_RELEASE_DOMAINS) ?? releaseUrl;

      reply.send({
        success: true,
        data: {
          current_version: currentVersion,
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
