import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// 创建或收紧 Papyrus 私有目录权限，输入为目录路径，输出为同一路径。
// 原因：macOS/Linux 默认 umask 可能让 Application Support 内的笔记库和日志对同机其他用户可读。
// 未在 Windows 强制 POSIX mode：NTFS ACL 不由 chmod 位完整表达，盲目调用无法提供等价保证。
function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dirPath, 0o700);
    } catch {
      // 只读或特殊文件系统可能拒绝 chmod，后续真实 I/O 会给出更明确错误。
    }
  }
  return dirPath;
}

// 把已存在或刚创建的敏感文件限制为仅当前用户可访问。
// 原因：writeFile 的 mode 只在首次创建时生效，升级用户的旧 token/key/db 可能仍保留过宽权限。
// 未把权限失败升级为启动失败：网络盘和企业管理卷可能不支持 chmod，应用仍应保留可用性。
export function protectPrivateFile(filePath: string, mode: number = 0o600): void {
  if (process.platform === 'win32') {
    return;
  }
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best-effort hardening for POSIX filesystems.
  }
}

function getDataDir(): string {
  const dir = process.env.PAPYRUS_DATA_DIR
    ? path.resolve(process.env.PAPYRUS_DATA_DIR)
    : path.join(os.homedir(), 'PapyrusData');
  return ensureDir(dir);
}

export const paths = {
  get dataDir() { return getDataDir(); },
  get dbFile() { return path.join(getDataDir(), 'papyrus.db'); },
  get dataFile() { return path.join(getDataDir(), 'data.json'); },
  get aiConfigFile() { return path.join(getDataDir(), 'ai_config.json'); },
  get masterKeyFile() { return path.join(getDataDir(), '.master_key'); },
  get logDir() { return ensureDir(path.join(getDataDir(), 'logs')); },
  get vaultDir() { return path.join(getDataDir(), 'vault'); },
  get backupDir() { return ensureDir(path.join(getDataDir(), 'backups')); },
  get versionStoreDir() { return ensureDir(path.join(getDataDir(), 'versions')); },
};
