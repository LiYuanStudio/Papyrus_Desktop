import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export interface CliManagerManifest {
  currentVersion: string;
  executablePath: string;
  packageName: string;
  installedAt: string;
  source: 'bundled';
}

export interface CliStatus {
  success: true;
  installed: boolean;
  version: string | null;
  path: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  packageName: string;
  source: 'bundled';
}

export interface CliInstallResult {
  success: true;
  version: string;
  path: string;
  packageName: string;
  source: 'bundled';
}

export interface CliRunResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface CliManagerOptions {
  rootDir?: string;
  packageName?: string;
  builtinEntryPath?: string;
}

const DEFAULT_PACKAGE = '@papyrus/cli';
const MANIFEST_FILE = 'manifest.json';
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(MODULE_DIR, '..', '..');
const requireFromHere = createRequire(import.meta.url);

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isManifest(value: unknown): value is CliManagerManifest {
  if (!isRecord(value)) return false;
  return (
    typeof value.currentVersion === 'string' &&
    typeof value.executablePath === 'string' &&
    typeof value.packageName === 'string' &&
    typeof value.installedAt === 'string' &&
    value.source === 'bundled'
  );
}

// 解析内置 CLI 入口文件，输入为可选覆盖路径，输出为当前运行环境可直接执行的脚本路径。
// 原因：开发态需要指向 `src/cli/papyrus-cli.ts`，打包后需要指向 `dist/cli/papyrus-cli.js`，统一在这里分流最稳妥。
// 未继续依赖 npm 下载目录：用户希望 Desktop 自带 CLI，直接解析仓库/安装包内资源可消除下载失败和版本错位。
function resolveBundledEntry(explicitPath?: string): string | null {
  const candidates = explicitPath
    ? [explicitPath]
    : [
        path.join(MODULE_DIR, 'papyrus-cli.js'),
        path.join(MODULE_DIR, 'papyrus-cli.ts'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// 读取后端版本号，输入为空，输出为内置 CLI 应向外暴露的版本字符串。
// 原因：内置 CLI 与 Desktop 同仓发布，沿用 backend/package.json 版本可保持“CLI 与 Desktop 同步”的语义。
// 未额外维护独立 CLI 版本文件：双版本源会增加发布和排障复杂度，而且当前目标就是消除外部 CLI 漂移。
function readBundledVersion(): string {
  const packageJsonPath = path.join(BACKEND_ROOT, 'package.json');
  try {
    const parsedJson: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (isRecord(parsedJson) && typeof parsedJson.version === 'string') {
      return parsedJson.version;
    }
  } catch {
    // ignore version read failures and fall back to a stable marker
  }
  return '0.0.0-dev';
}

// 为 manifest 提供统一来源描述，输入为 CLI 路径与版本，输出为完整 manifest。
// 原因：尽管 CLI 已内置，仍保留 manifest 便于设置页、MCP 和诊断工具读取同一份状态。
// 未移除 manifest 机制：保留原 API 结构能减少前端和集成层的改动面。
function createBundledManifest(executablePath: string, packageName: string): CliManagerManifest {
  return {
    currentVersion: readBundledVersion(),
    executablePath,
    packageName,
    installedAt: new Date().toISOString(),
    source: 'bundled',
  };
}

// 为 TypeScript 入口解析本地 tsx 运行时，输入为空，输出为可供 Node 直接执行的 tsx CLI 文件路径。
// 原因：开发态内置 CLI 指向 `.ts` 源文件，直接定位项目内 `tsx` 比调用 `npx` 更稳定，也能避免 Windows/Jest 下的 spawn 兼容问题。
// 未继续使用 `npx tsx`：`npx` 依赖外层命令解析，测试和打包环境下更容易受 shell、PATH 和 `.cmd` 行为影响。
function resolveTsxCliPath(): string {
  try {
    return requireFromHere.resolve('tsx/dist/cli.mjs');
  } catch {
    return path.join(BACKEND_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
}

export class CliManager {
  private readonly rootDir: string;
  private readonly packageName: string;
  private readonly builtinEntryPath?: string;

  constructor(options: CliManagerOptions = {}) {
    this.rootDir = options.rootDir ?? path.join(BACKEND_ROOT, '.papyrus-cli');
    this.packageName = options.packageName ?? DEFAULT_PACKAGE;
    this.builtinEntryPath = options.builtinEntryPath;
  }

  getManifestPath(): string {
    return path.join(this.rootDir, MANIFEST_FILE);
  }

  readManifest(): CliManagerManifest | null {
    const manifestPath = this.getManifestPath();
    if (!fs.existsSync(manifestPath)) return null;
    const parsedJson: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return isManifest(parsedJson) ? parsedJson : null;
  }

  writeManifest(manifest: CliManagerManifest): void {
    ensureDir(this.rootDir);
    fs.writeFileSync(this.getManifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  private resolveBundledExecutable(): string | null {
    return resolveBundledEntry(this.builtinEntryPath);
  }

  private resolveRuntimeManifest(): CliManagerManifest | null {
    const manifest = this.readManifest();
    if (manifest && fs.existsSync(manifest.executablePath)) {
      return manifest;
    }
    const bundledExecutable = this.resolveBundledExecutable();
    if (!bundledExecutable) {
      return null;
    }
    return createBundledManifest(bundledExecutable, this.packageName);
  }

  async getStatus(): Promise<CliStatus> {
    const manifest = this.resolveRuntimeManifest();
    const installed = Boolean(manifest && fs.existsSync(manifest.executablePath));
    const version = installed && manifest ? manifest.currentVersion : null;
    return {
      success: true,
      installed,
      version,
      path: installed && manifest ? manifest.executablePath : null,
      latestVersion: version,
      updateAvailable: false,
      packageName: this.packageName,
      source: 'bundled',
    };
  }

  async install(): Promise<CliInstallResult> {
    const bundledExecutable = this.resolveBundledExecutable();
    if (!bundledExecutable) {
      throw new Error('Desktop 内置 CLI 入口不存在');
    }
    const manifest = createBundledManifest(bundledExecutable, this.packageName);
    this.writeManifest(manifest);
    return {
      success: true,
      version: manifest.currentVersion,
      path: manifest.executablePath,
      packageName: manifest.packageName,
      source: 'bundled',
    };
  }

  async update(): Promise<CliInstallResult> {
    return this.install();
  }

  async run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<CliRunResult> {
    const manifest = this.resolveRuntimeManifest();
    if (!manifest || !fs.existsSync(manifest.executablePath)) {
      throw new Error('Desktop 内置 CLI 不可用');
    }

    const runEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...env,
      PAPYRUS_API_URL: env.PAPYRUS_API_URL ?? process.env.PAPYRUS_API_URL ?? `http://127.0.0.1:${process.env.PAPYRUS_PORT ?? '8000'}/api`,
      PAPYRUS_MCP_URL: env.PAPYRUS_MCP_URL ?? process.env.PAPYRUS_MCP_URL ?? 'http://127.0.0.1:9200',
      PAPYRUS_AUTH_TOKEN: env.PAPYRUS_AUTH_TOKEN ?? process.env.PAPYRUS_AUTH_TOKEN,
    };

    return await new Promise((resolve, reject) => {
      const executablePath = manifest.executablePath;
      const isTypeScriptEntry = executablePath.endsWith('.ts');
      const isJavaScriptEntry = executablePath.endsWith('.js') || executablePath.endsWith('.mjs') || executablePath.endsWith('.cjs');
      const command = isTypeScriptEntry
        ? process.execPath
        : isJavaScriptEntry
          ? process.execPath
          : executablePath;
      const finalArgs = isTypeScriptEntry
        ? [resolveTsxCliPath(), executablePath, ...args]
        : isJavaScriptEntry
          ? [executablePath, ...args]
          : args;
      const child = spawn(command, finalArgs, {
        cwd: BACKEND_ROOT,
        env: runEnv,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', chunk => { stdout += String(chunk); });
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('close', exitCode => {
        resolve({
          success: exitCode === 0,
          exitCode,
          stdout,
          stderr,
        });
      });
    });
  }
}

export const defaultCliManager = new CliManager();
