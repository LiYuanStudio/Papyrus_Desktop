import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { FileWatcher, getFileWatcher, startFileWatching, stopFileWatching } from '../../src/integrations/file-watcher.js';

describe('FileWatcher', () => {
  let tempDir: string;
  let watcher: FileWatcher;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-fw-test-'));
    watcher = new FileWatcher(tempDir);
  });

  afterEach(() => {
    watcher.stop();
    fs.rmSync(tempDir, { recursive: true, force: true });
    stopFileWatching();
  });

  it('should call callback on db file creation', async () => {
    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });

    await new Promise(r => setTimeout(r, 100));

    fs.writeFileSync(path.join(tempDir, 'test.db'), 'data');

    await new Promise(r => setTimeout(r, 400));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.type).toBe('created');
  });

  it('should call callback on db file modification', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    fs.writeFileSync(dbPath, 'initial');

    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });

    await new Promise(r => setTimeout(r, 100));

    fs.writeFileSync(dbPath, 'modified');
    await new Promise(r => setTimeout(r, 300));

    const modifiedEvents = events.filter(e => e.type === 'modified');
    expect(modifiedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('should debounce rapid modifications', async () => {
    const dbPath = path.join(tempDir, 'test.db');
    fs.writeFileSync(dbPath, 'initial');

    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });

    await new Promise(r => setTimeout(r, 100));

    fs.writeFileSync(dbPath, 'v1');
    fs.writeFileSync(dbPath, 'v2');
    fs.writeFileSync(dbPath, 'v3');

    await new Promise(r => setTimeout(r, 300));

    const modifiedEvents = events.filter(e => e.type === 'modified');
    expect(modifiedEvents.length).toBeLessThanOrEqual(2);
  });

  it('should ignore non-db files', async () => {
    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });

    fs.writeFileSync(path.join(tempDir, 'readme.txt'), 'hello');
    await new Promise(r => setTimeout(r, 300));

    expect(events.length).toBe(0);
  });

  it('should return singleton from getFileWatcher', () => {
    const fw1 = getFileWatcher();
    const fw2 = getFileWatcher();
    expect(fw1).toBe(fw2);
  });

  it('should report running state', () => {
    expect(watcher.isRunning()).toBe(false);
    watcher.start(() => {});
    expect(watcher.isRunning()).toBe(true);
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it('should ignore start when already running', () => {
    const cb = jest.fn();
    watcher.start(cb);
    watcher.start(cb);
    expect(watcher.isRunning()).toBe(true);
  });

  it('should ignore stop when not running', () => {
    watcher.stop();
    expect(watcher.isRunning()).toBe(false);
  });

  it('should ignore change on non-db files', async () => {
    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });
    await new Promise(r => setTimeout(r, 100));

    const txtPath = path.join(tempDir, 'readme.txt');
    fs.writeFileSync(txtPath, 'hello');
    await new Promise(r => setTimeout(r, 300));
    fs.writeFileSync(txtPath, 'world');
    await new Promise(r => setTimeout(r, 300));

    expect(events.filter(e => e.path === txtPath).length).toBe(0);
  });

  it('should ignore unlink on non-db files', async () => {
    const txtPath = path.join(tempDir, 'readme.txt');
    fs.writeFileSync(txtPath, 'hello');

    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });
    await new Promise(r => setTimeout(r, 100));

    fs.rmSync(txtPath);
    await new Promise(r => setTimeout(r, 300));

    expect(events.filter(e => e.path === txtPath).length).toBe(0);
  });

  it('should switch watcher path in getFileWatcher', () => {
    const dir1 = path.join(os.tmpdir(), 'papyrus-fw-1-' + Date.now());
    const dir2 = path.join(os.tmpdir(), 'papyrus-fw-2-' + Date.now());
    fs.mkdirSync(dir1, { recursive: true });
    fs.mkdirSync(dir2, { recursive: true });

    const fw1 = getFileWatcher(dir1);
    const fw2 = getFileWatcher(dir2);
    expect(fw1).not.toBe(fw2);
    expect(fw2.watchPath).toBe(dir2);

    fs.rmSync(dir1, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  it('should start file watching via startFileWatching', () => {
    const w = startFileWatching(() => {}, tempDir);
    expect(w.isRunning()).toBe(true);
    w.stop();
  });

  it('should detect .sqlite and .sqlite3 files', async () => {
    const events: Array<{ type: string; path: string }> = [];
    watcher.start((type, filePath) => {
      events.push({ type, path: filePath });
    });
    await new Promise(r => setTimeout(r, 100));

    fs.writeFileSync(path.join(tempDir, 'data.sqlite'), 's1');
    fs.writeFileSync(path.join(tempDir, 'data.sqlite3'), 's2');
    await new Promise(r => setTimeout(r, 300));

    const types = events.map(e => path.extname(e.path));
    expect(types).toContain('.sqlite');
    expect(types).toContain('.sqlite3');
  });

});
