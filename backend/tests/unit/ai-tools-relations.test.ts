import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { RELATION_TOOLS } from '../../src/ai/tools/relations.js';
import { createNote } from '../../src/core/notes.js';
import type { ToolRunContext } from '../../src/ai/tools/types.js';

describe('ai-tools-relations', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  const ctx: ToolRunContext = { logger: null };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-tools-rels-test-'));
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
    const tool = RELATION_TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe('create_relation', () => {
    it('returns error for invalid source_id format', () => {
      const result = getTool('create_relation').runner({
        source_id: 'bad id', target_id: 'valid123', relation_type: 'ref'
      }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });

    it('returns error for invalid target_id format', () => {
      const result = getTool('create_relation').runner({
        source_id: 'valid123', target_id: 'bad id', relation_type: 'ref'
      }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });
  });

  describe('update_relation', () => {
    it('returns error for non-existent relation_id', () => {
      const result = getTool('update_relation').runner({
        relation_id: 'nonexistent123', relation_type: 'new'
      }, ctx);
      expect(result.success).toBe(false);
    });

    it('returns error for invalid id format', () => {
      const result = getTool('update_relation').runner({
        relation_id: 'bad-id!', relation_type: 'new'
      }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });
  });

  describe('delete_relation', () => {
    it('returns error for non-existent relation_id', () => {
      const result = getTool('delete_relation').runner({ relation_id: 'nonexistent123' }, ctx);
      expect(result.success).toBe(false);
    });
  });

  describe('list_relations', () => {
    it('returns error for invalid note_id format', () => {
      const result = getTool('list_relations').runner({ note_id: 'bad id' }, ctx);
      expect(result.success).toBe(false);
      expect(String(result.error)).toContain('非法字符');
    });

    it('returns empty arrays for note with no relations', () => {
      const note = createNote('Orphan', 'content');
      const result = getTool('list_relations').runner({ note_id: note.id }, ctx);
      expect(result.success).toBe(true);
      expect(result.outgoing_count).toBe(0);
      expect(result.incoming_count).toBe(0);
    });
  });
});
