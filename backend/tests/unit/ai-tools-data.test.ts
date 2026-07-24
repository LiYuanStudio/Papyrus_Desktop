import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { DATA_TOOLS } from '../../src/ai/tools/data.js';
import type { ToolRunContext } from '../../src/ai/tools/types.js';

describe('ai-tools-data', () => {
  let tempDir: string;
  const originalEnv = process.env.PAPYRUS_DATA_DIR;
  let closeDb: typeof import('../../src/db/database.js').closeDb;
  let getDb: typeof import('../../src/db/database.js').getDb;
  const ctx: ToolRunContext = { logger: null };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-ai-tools-data-test-'));
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
    const tool = DATA_TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool;
  }

  describe('read_data_stats', () => {
    it('returns zeros for empty database', () => {
      const result = getTool('read_data_stats').runner({}, ctx);
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      const stats = result.stats as Record<string, number>;
      expect(stats.card_count).toBe(0);
      expect(stats.note_count).toBe(0);
      expect(stats.file_count).toBe(0);
      expect(stats.folder_count).toBe(0);
    });
  });
});
