import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { NOTE_TOOLS } from '../../src/ai/tools/notes.js';
import type { ToolRunContext } from '../../src/ai/tools/types.js';

describe('ai-tools-notes', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  let resetDb: typeof import('../../src/db/database.js').resetDb;
  const ctx: ToolRunContext = { logger: null };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-tools-notes-test-'));
    process.env.PAPYRUS_DATA_DIR = tempDir;
    const dbMod = await import('../../src/db/database.js');
    closeDb = dbMod.closeDb;
    getDb = dbMod.getDb;
    resetDb = dbMod.resetDb;
    getDb();
  });

  afterEach(() => {
    closeDb();
    if (originalEnv !== undefined) process.env.PAPYRUS_DATA_DIR = originalEnv;
    else delete process.env.PAPYRUS_DATA_DIR;
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function getTool(name: string) {
    const tool = NOTE_TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe('create_note', () => {
    it('rejects empty title', () => {
      const result = getTool('create_note').runner({ title: '', content: 'c' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('title');
    });

    it('creates note with valid params', () => {
      const result = getTool('create_note').runner({ title: 'Test', content: 'Body' }, ctx);
      expect(result.success).toBe(true);
      expect(result.note).toBeDefined();
      expect((result.note as Record<string, unknown>).title).toBe('Test');
    });
  });

  describe('update_note', () => {
    it('returns error for non-existent note_id', () => {
      const result = getTool('update_note').runner({ note_id: 'nonexistent123', content: 'x' }, ctx);
      expect(result.success).toBe(false);
    });

    it('returns error for invalid id format', () => {
      const result = getTool('update_note').runner({ note_id: 'bad-id!', content: 'x' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });
  });

  describe('delete_note', () => {
    it('returns error for non-existent note_id', () => {
      const result = getTool('delete_note').runner({ note_id: 'nonexistent123' }, ctx);
      expect(result.success).toBe(false);
    });

    it('returns error for invalid id format', () => {
      const result = getTool('delete_note').runner({ note_id: 'bad id' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });
  });

  describe('search_notes', () => {
    it('returns error for empty query', () => {
      const result = getTool('search_notes').runner({ query: '' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('query');
    });

    it('returns empty results when no notes match', () => {
      const result = getTool('search_notes').runner({ query: 'unlikelyxyz' }, ctx);
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  describe('get_note', () => {
    it('returns error for non-existent note_id', () => {
      const result = getTool('get_note').runner({ note_id: 'nonexistent123' }, ctx);
      expect(result.success).toBe(false);
    });

    it('returns error for invalid id format', () => {
      const result = getTool('get_note').runner({ note_id: 'bad id' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });
  });
});
