import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { FILE_TOOLS } from '../../src/ai/tools/files.js';
import { saveFile, createFolder } from '../../src/core/files.js';
import { insertFile } from '../../src/db/database.js';
import type { ToolRunContext } from '../../src/ai/tools/types.js';

describe('ai-tools-files', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  const ctx: ToolRunContext = { logger: null };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-tools-files-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    const dbMod = await import('../../src/db/database.js');
    closeDb = dbMod.closeDb;
    getDb = dbMod.getDb;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function getTool(name: string) {
    const tool = FILE_TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe('list_files', () => {
    it('returns error for invalid parent_id format', () => {
      const result = getTool('list_files').runner({ parent_id: 'invalid!@#' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });

    it('returns all files when parent_id not provided', () => {
      createFolder('docs');
      const result = getTool('list_files').runner({}, ctx);
      expect(result.success).toBe(true);
      expect(Array.isArray(result.files)).toBe(true);
    });
  });

  describe('read_file', () => {
    it('returns error for non-existent file_id', () => {
      const result = getTool('read_file').runner({ file_id: 'nonexistent123' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('不存在');
    });

    it('returns error for binary file', () => {
      const content = Buffer.from('fake binary').toString('base64');
      const file = saveFile('binary.bin', content);
      const result = getTool('read_file').runner({ file_id: file.id }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('仅支持文本文件');
    });

    it('truncates file larger than 1MB', () => {
      const bigContent = Buffer.alloc(2 * 1024 * 1024).toString('base64');
      const file = saveFile('big.txt', bigContent);
      const result = getTool('read_file').runner({ file_id: file.id }, ctx);
      expect(result.success).toBe(true);
      expect(result.truncated).toBe(true);
      expect(result.preview_bytes).toBe(8192);
    });

    it('reads text file successfully', () => {
      const content = Buffer.from('hello world').toString('base64');
      const file = saveFile('hello.txt', content);
      const result = getTool('read_file').runner({ file_id: file.id }, ctx);
      expect(result.success).toBe(true);
      expect(result.content).toBe('hello world');
    });

    it('rejects file records pointing outside vault storage', () => {
      const outsidePath = path.join(os.tmpdir(), `papyrus-outside-read-${Date.now()}.txt`);
      fs.writeFileSync(outsidePath, 'outside vault', 'utf8');
      const now = Date.now() / 1000;
      insertFile({
        id: 'outside-file-record',
        name: 'outside.txt',
        type: 'file',
        size: 13,
        mime_type: 'text/plain',
        parent_id: null,
        file_storage_path: outsidePath,
        is_folder: 0,
        created_at: now,
        updated_at: now,
      });

      const result = getTool('read_file').runner({ file_id: 'outside-file-record' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toMatch(/存储目录|vault|允许/);

      try {
        fs.rmSync(outsidePath, { force: true });
      } catch {
        // ignore cleanup errors
      }
    });
  });
});
