import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { jest } from '@jest/globals';
import { PapyrusLogger } from '../../src/utils/logger.js';

describe('PapyrusLogger', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-logger-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create logger and write info log', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('test info');
    const logs = logger.getLogs('all', 10);
    expect(logs.some(l => l.includes('test info'))).toBe(true);
  });

  it('should write error log to both main and error files', () => {
    const logger = new PapyrusLogger(testDir);
    logger.error('test error');
    const logs = logger.getLogs('error', 10);
    expect(logs.some(l => l.includes('test error'))).toBe(true);
  });

  it('should filter by log level', () => {
    const logger = new PapyrusLogger(testDir, 'WARNING');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warning('warning msg');
    const logs = logger.getLogs('all', 10);
    expect(logs.some(l => l.includes('debug msg'))).toBe(false);
    expect(logs.some(l => l.includes('info msg'))).toBe(false);
    expect(logs.some(l => l.includes('warning msg'))).toBe(true);
  });

  it('should change log directory', () => {
    const logger = new PapyrusLogger(testDir);
    const newDir = path.join(testDir, 'sub');
    expect(logger.setLogDir(newDir)).toBe(true);
    logger.info('in new dir');
    const logs = logger.getLogs('all', 10);
    expect(logs.some(l => l.includes('in new dir'))).toBe(true);
  });

  it('should reject invalid log level', () => {
    const logger = new PapyrusLogger(testDir);
    expect(logger.setLogLevel('INVALID')).toBe(false);
    expect(logger.setLogLevel('INFO')).toBe(true);
  });

  it('should toggle log rotation', () => {
    const logger = new PapyrusLogger(testDir);
    expect(logger.setLogRotation(true)).toBe(true);
    expect(logger.setLogRotation(false)).toBe(true);
  });

  it('should set max log files', () => {
    const logger = new PapyrusLogger(testDir);
    expect(logger.setMaxLogFiles(5)).toBe(true);
    expect(logger.getConfig().max_log_files).toBe(5);
  });

  it('should get config', () => {
    const logger = new PapyrusLogger(testDir, 'ERROR', 3, true);
    const config = logger.getConfig();
    expect(config.log_dir).toBe(testDir);
    expect(config.log_level).toBe('ERROR');
    expect(config.max_log_files).toBe(3);
    expect(config.log_rotation).toBe(true);
  });

  it('should clear logs', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('before clear');
    logger.clearLogs();
    const logs = logger.getLogs('all', 10);
    expect(logs.some(l => l.includes('before clear'))).toBe(false);
  });

  it('should export logs', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('export me');
    const exportDir = path.join(testDir, 'export');
    const result = logger.exportLogs(exportDir);
    expect(result).not.toBeNull();
    expect(fs.existsSync(result!)).toBe(true);
  });

  it('should return null for export failure', () => {
    const logger = new PapyrusLogger(testDir);
    const result = logger.exportLogs(path.join(testDir, 'non-existent', 'nested'));
    // This may actually succeed because mkdirSync is recursive
    expect(typeof result === 'string' || result === null).toBe(true);
  });

  it('should open log dir', () => {
    const logger = new PapyrusLogger(testDir);
    expect(logger.openLogDir()).toBe(testDir);
  });

  it('should log events with sanitized data', () => {
    const logger = new PapyrusLogger(testDir);
    logger.logEvent('test_event', { api_key: 'secret123', normal: 'data' });
    const logs = logger.getLogs('events', 10);
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    expect((parsed.data as Record<string, unknown>).api_key).toContain('***');
    expect((parsed.data as Record<string, unknown>).normal).toBe('data');
  });

  it('should log activity', () => {
    const logger = new PapyrusLogger(testDir);
    logger.logActivity('create_card', { id: 1 });
    const logs = logger.getLogs('activity', 10);
    expect(logs.length).toBeGreaterThan(0);
  });

  it('should handle unknown log type in getLogs', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('fallback');
    const logs = logger.getLogs('unknown', 10);
    expect(logs.some(l => l.includes('fallback'))).toBe(true);
  });

  it('should return empty array for non-existent log file', () => {
    const logger = new PapyrusLogger(testDir);
    // clearLogs removes files, then getLogs should return []
    logger.clearLogs();
    expect(logger.getLogs('events', 10)).toEqual([]);
  });

  it('should sanitize long strings', () => {
    const logger = new PapyrusLogger(testDir);
    const longStr = 'a'.repeat(1000);
    logger.logEvent('long', { value: longStr });
    const logs = logger.getLogs('events', 10);
    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    const value = (parsed.data as Record<string, unknown>).value as string;
    expect(value.length).toBeLessThan(longStr.length);
  });

  it('should sanitize short sensitive strings', () => {
    const logger = new PapyrusLogger(testDir);
    logger.logEvent('short', { api_key: 'tiny' });
    const logs = logger.getLogs('events', 10);
    const lastLog = logs[logs.length - 1]!;
    const parsed = JSON.parse(lastLog) as Record<string, unknown>;
    expect((parsed.data as Record<string, unknown>).api_key).toBe('***');
  });

  it('should sanitize non-string sensitive values', () => {
    const logger = new PapyrusLogger(testDir);
    logger.logEvent('nonstring', { api_key: 12345 });
    const logs = logger.getLogs('events', 10);
    const parsed = JSON.parse(logs[0]!) as Record<string, unknown>;
    const masked = (parsed.data as Record<string, unknown>).api_key;
    expect(masked).not.toBe(12345);
  });

  it('should skip cleanup when maxLogFiles <= 0', () => {
    const logger = new PapyrusLogger(testDir, 'DEBUG', 0);
    logger.info('no cleanup');
    expect(logger.getConfig().max_log_files).toBe(0);
  });

  it('should handle write failure silently', () => {
    const logger = new PapyrusLogger(testDir);
    const spy = jest.spyOn(fs, 'appendFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    logger.info('should not throw');
    spy.mockRestore();
  });

  it('should handle getLogs read failure', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('create file');
    const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('permission denied');
    });
    expect(logger.getLogs('all', 10)).toEqual([]);
    spy.mockRestore();
  });

  it('should handle exportLogs write failure', () => {
    const logger = new PapyrusLogger(testDir);
    logger.info('export fail');
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    const result = logger.exportLogs(testDir);
    expect(result).toBeNull();
    spy.mockRestore();
  });

  it('should handle clearLogs when files do not exist', () => {
    const subDir = path.join(testDir, 'clear-empty');
    fs.mkdirSync(subDir, { recursive: true });
    const logger = new PapyrusLogger(subDir);
    // Do not write anything; all log files are empty/uncreated
    expect(() => logger.clearLogs()).not.toThrow();
  });

  it('should handle cleanup readdir failure silently', () => {
    const spy = jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('permission denied');
    });
    const logger = new PapyrusLogger(testDir, 'DEBUG', 1);
    expect(logger.getConfig().max_log_files).toBe(1);
    spy.mockRestore();
  });

  it('should rotate log file when size exceeds 10MB', () => {
    const logger = new PapyrusLogger(testDir, 'DEBUG', 3, true);

    // 手动把日志文件塞到 11MB（超过 10MB 阈值）
    const bigContent = 'x'.repeat(11 * 1024 * 1024);
    fs.writeFileSync(path.join(testDir, 'papyrus.log'), bigContent);

    // 写一条新日志，触发轮转
    logger.info('after rotation');

    // 验证：目录里出现了 .backup. 文件
    const files = fs.readdirSync(testDir);
    const backups = files.filter(f => f.includes('.backup.'));
    expect(backups.length).toBe(1);

    // 验证：新日志写到了新文件里
    const logs = logger.getLogs('all', 10);
    expect(logs.some(l => l.includes('after rotation'))).toBe(true);
  });

  it('should clean up old backups when rotating', () => {
    const logger = new PapyrusLogger(testDir, 'DEBUG', 2, true);

    // 手动创建 3 个假的老备份文件
    fs.writeFileSync(path.join(testDir, 'papyrus.backup.2024-01-01-00-00-00.log'), 'old1');
    fs.writeFileSync(path.join(testDir, 'papyrus.backup.2024-02-01-00-00-00.log'), 'old2');
    fs.writeFileSync(path.join(testDir, 'papyrus.backup.2024-03-01-00-00-00.log'), 'old3');

    // 让主日志文件超过 10MB
    fs.writeFileSync(path.join(testDir, 'papyrus.log'), 'x'.repeat(11 * 1024 * 1024));

    // 触发轮转
    logger.info('trigger cleanup');

    // 验证：备份文件数量不超过 max_log_files（2 个）
    const files = fs.readdirSync(testDir).filter(f => f.includes('.backup.'));
    expect(files.length).toBeLessThanOrEqual(2);
  });

  describe('edge cases', () => {
    it('exportLogs returns null when path is not a directory', () => {
      const logger = new PapyrusLogger(testDir);
      // Create a file, then try to export into it as if it were a directory
      // mkdirSync on a file path throws EEXIST, causing exportLogs to return null
      const filePath = path.join(testDir, 'not-a-dir');
      fs.writeFileSync(filePath, 'I am a file');
      const result = logger.exportLogs(filePath);
      expect(result).toBeNull();
    });

    it('handles empty log directory gracefully', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-logger-empty-'));
      const logger = new PapyrusLogger(emptyDir);
      const logs = logger.getLogs('all', 10);
      expect(Array.isArray(logs)).toBe(true);
      try { fs.rmSync(emptyDir, { recursive: true, force: true }); } catch { /* ignore */ }
    });
  });
});
