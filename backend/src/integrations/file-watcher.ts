import { watch, FSWatcher } from 'chokidar';
import { paths } from '../utils/paths.js';

export type ChangeCallback = (eventType: string, filePath: string) => void;

export class FileWatcher {
  readonly watchPath: string;
  private watcher: FSWatcher | null = null;
  private callback: ChangeCallback | null = null;
  private running = false;
  private lastModified: Map<string, number> = new Map();
  private debounceSeconds = 0.5;

  constructor(watchPath?: string) {
    this.watchPath = watchPath ?? paths.dataDir;
  }

  start(callback: ChangeCallback): void {
    if (this.running) return;

    this.callback = callback;
    this.watcher = watch(this.watchPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      depth: 1,
    });

    this.watcher.on('add', (filePath: string) => {
      if (!this.isDbFile(filePath)) return;
      this.callback?.('created', filePath);
    });

    this.watcher.on('change', (filePath: string) => {
      if (!this.isDbFile(filePath)) return;
      if (!this.shouldTrigger(filePath)) return;
      this.callback?.('modified', filePath);
    });

    this.watcher.on('unlink', (filePath: string) => {
      if (!this.isDbFile(filePath)) return;
      this.callback?.('deleted', filePath);
    });

    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.watcher?.close().catch(() => {});
    this.watcher = null;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private isDbFile(filePath: string): boolean {
    return filePath.endsWith('.db') || filePath.endsWith('.sqlite') || filePath.endsWith('.sqlite3');
  }

  private shouldTrigger(filePath: string): boolean {
    const now = Date.now() / 1000;
    const last = this.lastModified.get(filePath) ?? 0;
    if (now - last < this.debounceSeconds) return false;
    this.lastModified.set(filePath, now);
    return true;
  }
}

let globalWatcher: FileWatcher | null = null;

export function getFileWatcher(watchPath?: string): FileWatcher {
  const targetPath = watchPath ?? paths.dataDir;
  if (!globalWatcher || globalWatcher.watchPath !== targetPath) {
    if (globalWatcher) {
      globalWatcher.stop();
    }
    globalWatcher = new FileWatcher(watchPath);
  }
  return globalWatcher;
}

export function startFileWatching(callback: ChangeCallback, watchPath?: string): FileWatcher {
  const watcher = getFileWatcher(watchPath);
  watcher.start(callback);
  return watcher;
}

export function stopFileWatching(): void {
  globalWatcher?.stop();
  globalWatcher = null;
}
