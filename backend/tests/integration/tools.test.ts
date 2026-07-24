import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, initApp, logger } from '../../src/api/server.js';
import { closeDb, resetDb } from '../../src/db/database.js';
import { PapyrusTools, CardTools } from '../../src/ai/tools.js';
import { getToolManager, resetToolManager } from '../../src/ai/tool-manager.js';
import { patchAppInjectWithAuth } from '../test-auth.js';

describe('AI Tools Integration Tests', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-tools-test-${Date.now()}`);

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    await initApp();
    patchAppInjectWithAuth(app);
    logger.setLogDir(path.join(testDir, 'logs'));
  });

  afterAll(() => {
    closeDb();
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    resetDb();
    resetToolManager();
  });

  describe('Tool Registry', () => {
    it('should include all 20 tools in registry', () => {
      const pt = new PapyrusTools();
      const defs = pt.getToolsForOpenAI();
      const names = defs.map(d => d.function.name);
      expect(names.length).toBe(20);
      expect(names).toContain('create_card');
      expect(names).toContain('search_notes');
      expect(names).toContain('create_relation');
      expect(names).toContain('list_files');
      expect(names).toContain('read_data_stats');
      expect(names).toContain('list_extensions');
      expect(names).toContain('get_settings');
    });

    it('should support CardTools as alias', () => {
      // CardTools must remain usable for backward compatibility
      const ct = new CardTools();
      const result = ct.executeTool('get_card_stats', {});
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
    });

    it('should return error for unknown tools', () => {
      const pt = new PapyrusTools();
      const result = pt.executeTool('nonexistent_tool', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知工具');
    });
  });

  describe('Notes Lifecycle', () => {
    it('create_note → get_note → update_note → delete_note full lifecycle', () => {
      const pt = new PapyrusTools(logger);

      // Create
      const createResult = pt.executeTool('create_note', {
        title: 'Test Note',
        content: '# Hello\n\nThis is a test.',
        folder: '测试',
        tags: ['test', 'integration'],
      });
      expect(createResult.success).toBe(true);
      expect(createResult.note).toBeDefined();
      const noteId = (createResult.note as Record<string, unknown>).id as string;

      // Get
      const getResult = pt.executeTool('get_note', { note_id: noteId });
      expect(getResult.success).toBe(true);
      const note = getResult.note as Record<string, unknown>;
      expect(note.title).toBe('Test Note');
      expect(note.folder).toBe('测试');

      // Update
      const updateResult = pt.executeTool('update_note', {
        note_id: noteId,
        title: 'Updated Title',
      });
      expect(updateResult.success).toBe(true);
      const updatedNote = (updateResult.note as Record<string, unknown>);
      expect(updatedNote.title).toBe('Updated Title');

      // Delete
      const deleteResult = pt.executeTool('delete_note', { note_id: noteId });
      expect(deleteResult.success).toBe(true);
    });
  });

  describe('Relations Lifecycle', () => {
    it('create_relation → list_relations → delete_relation', () => {
      const pt = new PapyrusTools(logger);

      // Create two notes first
      const n1 = pt.executeTool('create_note', {
        title: 'Source Note',
        content: 'Source content',
      });
      const n2 = pt.executeTool('create_note', {
        title: 'Target Note',
        content: 'Target content',
      });
      const sourceId = (n1.note as Record<string, unknown>).id as string;
      const targetId = (n2.note as Record<string, unknown>).id as string;

      // Create relation
      const relResult = pt.executeTool('create_relation', {
        source_id: sourceId,
        target_id: targetId,
        relation_type: '引用',
        description: 'A引用B',
      });
      expect(relResult.success).toBe(true);
      const relId = relResult.relation_id as string;
      expect(relId).toBeTruthy();

      // List relations
      const listResult = pt.executeTool('list_relations', { note_id: sourceId });
      expect(listResult.success).toBe(true);
      const outgoing = listResult.outgoing as Array<Record<string, unknown>>;
      expect(outgoing.length).toBeGreaterThanOrEqual(1);

      // Delete relation
      const delResult = pt.executeTool('delete_relation', { relation_id: relId });
      expect(delResult.success).toBe(true);
    });
  });

  describe('Settings with Field Whitelist', () => {
    it('should ignore disallowed settings fields and report them', () => {
      const pt = new PapyrusTools(logger);
      const result = pt.executeTool('update_settings', {
        updates: {
          providers: { openai: { api_key: 'sk-bad', base_url: 'https://evil.com', models: ['gpt-99'] } },
        },
      });
      // Silently ignores disallowed fields, reports in ignored_keys
      expect(result.success).toBe(true);
      const ignored = result.ignored_keys as string[];
      expect(ignored.length).toBeGreaterThan(0);
    });

    it('should apply allowed settings fields', () => {
      const pt = new PapyrusTools(logger);
      const result = pt.executeTool('update_settings', {
        updates: {
          parameters: { temperature: 0.5 },
          features: { agent_enabled: true },
        },
      });
      expect(result.success).toBe(true);
      const applied = result.applied_keys as string[];
      expect(applied).toContain('parameters.temperature');
    });
  });

  describe('Validation Defenses', () => {
    const pt = new PapyrusTools(logger);

    it('should reject missing required params', () => {
      const result = pt.executeTool('create_note', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是字符串');
    });

    it('should reject invalid IDs', () => {
      const result = pt.executeTool('get_note', { note_id: '../evil' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('非法字符');
    });

    it('should reject oversized strings', () => {
      const longTitle = 'x'.repeat(201);
      const result = pt.executeTool('create_note', {
        title: longTitle,
        content: 'valid content',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('长度超过限制');
    });

    it('should reject wrong param types', () => {
      const result = pt.executeTool('search_notes', { query: 12345 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('必须是字符串');
    });
  });

  describe('Read-Only Tools', () => {
    const pt = new PapyrusTools(logger);

    it('read_data_stats returns aggregated counts', () => {
      const result = pt.executeTool('read_data_stats', {});
      expect(result.success).toBe(true);
      const stats = result.stats as Record<string, unknown>;
      expect(typeof stats.card_count).toBe('number');
      expect(typeof stats.note_count).toBe('number');
    });

    it('list_extensions returns extensions list', () => {
      const result = pt.executeTool('list_extensions', {});
      expect(result.success).toBe(true);
      const exts = result.extensions as Array<Record<string, unknown>>;
      expect(exts.length).toBeGreaterThan(0);
      expect(exts[0].id).toBeDefined();
    });

    it('get_settings returns masked config', () => {
      const result = pt.executeTool('get_settings', {});
      expect(result.success).toBe(true);
      const settings = result.settings as Record<string, unknown>;
      expect(settings.current_provider).toBeDefined();
      expect(settings.parameters).toBeDefined();
    });
  });

  describe('Approval Flow', () => {
    it('write tool submits, approves, executes', () => {
      const toolManager = getToolManager();
      const callId = toolManager.createPendingCall('create_note', {
        title: 'Approval Test',
        content: 'Created via approval flow',
      });
      expect(callId).toBeTruthy();

      const approved = toolManager.approveCall(callId);
      expect(approved).not.toBeNull();
      expect(approved!.status).toBe('approved');

      const executing = toolManager.markExecuting(callId);
      expect(executing).not.toBeNull();
      expect(executing!.status).toBe('executing');

      // Actually execute
      const pt = new PapyrusTools(logger);
      const result = pt.executeTool('create_note', {
        title: 'Approval Test',
        content: 'Created via approval flow',
      });
      expect(result.success).toBe(true);

      const completed = toolManager.completeCall(callId, result);
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('success');
    });
  });

  describe('Regression: Original 6 Card Tools', () => {
    it('should still work with PapyrusTools', () => {
      const pt = new PapyrusTools(logger);

      const c1 = pt.executeTool('create_card', { question: 'Q1', answer: 'A1' });
      expect(c1.success).toBe(true);

      const stats = pt.executeTool('get_card_stats', {});
      expect(stats.success).toBe(true);
      const s = stats.stats as Record<string, unknown>;
      expect(s.total_cards).toBe(1);

      const search = pt.executeTool('search_cards', { keyword: 'Q1' });
      expect(search.success).toBe(true);
      expect((search.results as Array<unknown>).length).toBe(1);
    });
  });

  describe('Data Stats Integration', () => {
    it('read_data_stats reflects note count after creation', () => {
      const pt = new PapyrusTools(logger);

      const statsBefore = pt.executeTool('read_data_stats', {});
      const beforeCount = (statsBefore.stats as Record<string, unknown>).note_count as number;

      pt.executeTool('create_note', {
        title: 'Stats Test',
        content: 'Testing data stats',
      });

      const statsAfter = pt.executeTool('read_data_stats', {});
      const afterCount = (statsAfter.stats as Record<string, unknown>).note_count as number;
      expect(afterCount).toBe(beforeCount + 1);
    });
  });
});
