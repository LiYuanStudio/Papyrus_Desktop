import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { paths } from '../../src/utils/paths.js';

describe('paths', () => {
  const originalDataDir = process.env.PAPYRUS_DATA_DIR;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-paths-test-'));
  });

  afterEach(() => {
    if (originalDataDir !== undefined) {
      process.env.PAPYRUS_DATA_DIR = originalDataDir;
    } else {
      delete process.env.PAPYRUS_DATA_DIR;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  });

  it('dataDir defaults to $HOME/PapyrusData when env not set', () => {
    delete process.env.PAPYRUS_DATA_DIR;
    expect(paths.dataDir).toContain('PapyrusData');
  });

  it('PAPYRUS_DATA_DIR overrides default', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    expect(paths.dataDir).toBe(tempDir);
  });

  it('restricts the data directory to the current user on POSIX platforms', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    void paths.dataDir;
    if (process.platform !== 'win32') {
      expect(fs.statSync(tempDir).mode & 0o777).toBe(0o700);
    }
  });

  it('logDir creates subdirectory if missing', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    expect(fs.existsSync(paths.logDir)).toBe(true);
    expect(paths.logDir).toContain('logs');
  });

  it('dbFile resides under dataDir', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    expect(paths.dbFile.startsWith(paths.dataDir)).toBe(true);
    expect(paths.dbFile).toContain('papyrus.db');
  });

  it('backupDir resides under dataDir', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    expect(paths.backupDir.startsWith(paths.dataDir)).toBe(true);
  });

  it('vaultDir resides under dataDir', () => {
    process.env.PAPYRUS_DATA_DIR = tempDir;
    expect(paths.vaultDir.startsWith(paths.dataDir)).toBe(true);
  });
});
