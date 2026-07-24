import fs from 'node:fs';
import path from 'node:path';

export type JSONScalar = string | number | boolean | null;
export interface JSONObject {
  [key: string]: JSONValue;
}
export type JSONValue = JSONScalar | JSONObject | JSONValue[];

const LOG_LEVEL_MAP: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARNING: 2,
  ERROR: 3,
};

export interface EventLogEntry {
  timestamp: string;
  event: string;
  level: string;
  data: JSONValue;
}

export interface ActivityLogEntry {
  timestamp: string;
  type: string;
  details: JSONValue;
}

export interface LogConfig {
  log_dir: string;
  log_level: string;
  max_log_files: number;
  log_rotation: boolean;
}

function formatLogLine(level: string, message: string): string {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `${now} - ${level} - ${message}\n`;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export class PapyrusLogger {
  private _logDir: string;
  private _logLevel: string;
  private _maxLogFiles: number;
  private _logRotation: boolean;

  private logFile: string;
  private errorLogFile: string;
  private activityLogFile: string;
  private eventsLogFile: string;

  constructor(
    logDir: string,
    logLevel: string = 'DEBUG',
    maxLogFiles: number = 10,
    logRotation: boolean = false,
  ) {
    this._logDir = logDir;
    this._logLevel = logLevel;
    this._maxLogFiles = maxLogFiles;
    this._logRotation = logRotation;

    ensureDir(logDir);

    this.logFile = path.join(logDir, 'papyrus.log');
    this.errorLogFile = path.join(logDir, 'error.log');
    this.activityLogFile = path.join(logDir, 'activity.log');
    this.eventsLogFile = path.join(logDir, 'events.log');

    this._cleanupOldLogs();
  }

  private _shouldLog(level: string): boolean {
    return (LOG_LEVEL_MAP[level] ?? 0) >= (LOG_LEVEL_MAP[this._logLevel] ?? 0);
  }

  private _writeToFile(filePath: string, line: string): void {
    try {
      fs.appendFileSync(filePath, line, 'utf8');
    } catch {
      // Silently fail to avoid infinite loops
    }
  }

  private _cleanupOldLogs(): void {
    if (this._maxLogFiles <= 0) return;

    try {
      const files = fs.readdirSync(this._logDir)
        .filter(f => f.endsWith('.log') && f.includes('.backup.'))
        .map(f => ({
          path: path.join(this._logDir, f),
          mtime: fs.statSync(path.join(this._logDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      for (const file of files.slice(this._maxLogFiles)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // Ignore
        }
      }
    } catch {
      // Ignore
    }
  }

  private _truncateIfNeeded(filePath: string): void {
    if (!this._logRotation) return;
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 10 * 1024 * 1024) { 
      //.todo:
      //.1.生成时间戳字符串：XXXX-XX-XX-XX-XX-XX
      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2,'0'),
        String(now.getDate()).padStart(2,'0'),
        String(now.getHours()).padStart(2,'0'),
        String(now.getMinutes()).padStart(2,'0'),
        String(now.getSeconds()).padStart(2,'0'),
      ].join('-');
      //.2.构造备份文件名称：原文件名去log，backup，时间戳与log
      const dir= path.dirname(filePath);
      const basename =path.basename(filePath,'.log');
      const backupFile = path.join(dir,basename+'.backup.'+timestamp+'.log');
      //.3.用fs.renameSync把原文件移到备份名
      fs.renameSync(filePath,backupFile);
      fs.writeFileSync(filePath,'','utf8');
      this._cleanupOldLogs();
      }
    } catch (e){
      console.error(`日志轮转失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  log(level: string, message: string): void {
    if (!this._shouldLog(level)) return;

    const line = formatLogLine(level, message);
    this._truncateIfNeeded(this.logFile);
    this._writeToFile(this.logFile, line);

    if (level === 'ERROR') {
    this._truncateIfNeeded(this.errorLogFile); 
    this._writeToFile(this.errorLogFile, line);
    }

    if (level !== 'DEBUG' && process.env.NODE_ENV !== 'test') {
      console.log(line.trimEnd());
    }
  }

  info(message: string): void {
    this.log('INFO', message);
  }

  error(message: string): void {
    this.log('ERROR', message);
  }

  warning(message: string): void {
    this.log('WARNING', message);
  }

  debug(message: string): void {
    this.log('DEBUG', message);
  }

  setLogDir(logDir: string): boolean {
    const oldDir = this._logDir;
    try {
      ensureDir(logDir);
      this._logDir = logDir;
      this.logFile = path.join(logDir, 'papyrus.log');
      this.errorLogFile = path.join(logDir, 'error.log');
      this.activityLogFile = path.join(logDir, 'activity.log');
      this.eventsLogFile = path.join(logDir, 'events.log');
      this.info(`日志目录已更改为: ${logDir}`);
      return true;
    } catch (e) {
      this._logDir = oldDir;
      this.error(`更改日志目录失败: ${e}`);
      return false;
    }
  }

  setLogLevel(level: string): boolean {
    if (!(level.toUpperCase() in LOG_LEVEL_MAP)) {
      this.error(`无效的日志级别: ${level}`);
      return false;
    }
    this._logLevel = level.toUpperCase();
    this.info(`日志级别已设置为: ${level}`);
    return true;
  }

  setLogRotation(enabled: boolean): boolean {
    this._logRotation = enabled;
    this.info(`日志轮转已${enabled ? '启用' : '禁用'}`);
    return true;
  }

  setMaxLogFiles(count: number): boolean {
    this._maxLogFiles = Math.max(1, count);
    this._cleanupOldLogs();
    this.info(`最大日志文件数已设置为: ${this._maxLogFiles}`);
    return true;
  }

  getConfig(): LogConfig {
    return {
      log_dir: this._logDir,
      log_level: this._logLevel,
      max_log_files: this._maxLogFiles,
      log_rotation: this._logRotation,
    };
  }

  public sanitize(obj: unknown, maxStrLen: number = 800): JSONValue {
    const maskValue = (v: unknown): JSONValue => {
      if (typeof v !== 'string') return this.sanitize(v, maxStrLen);
      if (v.length <= 8) return '***';
      return v.slice(0, 3) + '***' + v.slice(-2);
    };

    const truncateStr = (s: string): string => {
      if (s.length <= maxStrLen) return s;
      return s.slice(0, maxStrLen) + `...<truncated:${s.length}chars>`;
    };

    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string') return truncateStr(obj);
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

    if (Array.isArray(obj)) {
      return obj.map(x => this.sanitize(x, maxStrLen));
    }

    if (typeof obj === 'object') {
      const masked: Record<string, JSONValue> = {};
      for (const [k, v] of Object.entries(obj)) {
        const keyLower = k.toLowerCase();
        if (['api_key', 'authorization', 'token', 'secret', 'password', 'key'].some(t => keyLower.includes(t))) {
          masked[k] = maskValue(v);
        } else {
          masked[k] = this.sanitize(v, maxStrLen);
        }
      }
      return masked;
    }

    return truncateStr(String(obj));
  }

  private _writeJsonLine(filePath: string, payload: EventLogEntry | ActivityLogEntry): void {
    try {
      fs.appendFileSync(filePath, JSON.stringify(payload, null, 0) + '\n', 'utf8');
    } catch {
      // Ignore
    }
  }

  logEvent(eventType: string, data: unknown = null, level: string = 'INFO'): void {
    const event: EventLogEntry = {
      timestamp: new Date().toISOString(),
      event: eventType,
      level,
      data: this.sanitize(data),
    };
    this._writeJsonLine(this.eventsLogFile, event);
  }

  logActivity(activityType: string, details: unknown): void {
    const activity: ActivityLogEntry = {
      timestamp: new Date().toISOString(),
      type: activityType,
      details: this.sanitize(details),
    };
    this._writeJsonLine(this.activityLogFile, activity);
  }

  getLogs(logType: string = 'all', limit: number | null = 100): string[] {
    const logFileMap: Record<string, string> = {
      all: this.logFile,
      error: this.errorLogFile,
      activity: this.activityLogFile,
      events: this.eventsLogFile,
    };

    const file = logFileMap[logType] ?? this.logFile;
    if (!fs.existsSync(file)) return [];

    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(l => l.length > 0);
      return limit ? lines.slice(-limit) : lines;
    } catch {
      return [];
    }
  }

  clearLogs(): void {
    for (const file of [this.logFile, this.errorLogFile, this.activityLogFile, this.eventsLogFile]) {
      if (fs.existsSync(file)) {
        try {
          fs.writeFileSync(file, '', 'utf8');
        } catch {
          // Ignore
        }
      }
    }
    this.info('日志已清空');
  }

  exportLogs(exportPath: string): string | null {
    try {
      const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const exportFile = path.join(exportPath, `papyrus_logs_${timestamp}.txt`);
      ensureDir(exportPath);

      let out = '='.repeat(50) + '\n';
      out += 'Papyrus 日志导出\n';
      out += `导出时间: ${new Date().toLocaleString()}\n`;
      out += '='.repeat(50) + '\n\n';

      out += '【主日志】\n' + '-'.repeat(50) + '\n';
      out += this.getLogs('all', null).join('\n') + '\n\n';

      out += '【错误日志】\n' + '-'.repeat(50) + '\n';
      out += this.getLogs('error', null).join('\n') + '\n\n';

      out += '【活动日志】\n' + '-'.repeat(50) + '\n';
      out += this.getLogs('activity', null).join('\n') + '\n\n';

      out += '【事件日志】\n' + '-'.repeat(50) + '\n';
      out += this.getLogs('events', null).join('\n');

      fs.writeFileSync(exportFile, out, 'utf8');
      return exportFile;
    } catch (e) {
      this.error(`导出日志失败: ${e}`);
      return null;
    }
  }

  openLogDir(): string {
    this.info(`日志目录: ${this._logDir}`);
    return this._logDir;
  }
}
