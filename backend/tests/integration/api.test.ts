import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, initApp, logger } from '../../src/api/server.js';
import { closeDb, saveProvider, saveApiKey, saveModel } from '../../src/db/database.js';
import { patchAppInjectWithAuth } from '../test-auth.js';

describe('API Integration Tests', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-api-test-${Date.now()}`);
  const originalFetch = global.fetch;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    const { resetAIConfig } = await import('../../src/ai/config-instance.js');
    resetAIConfig(testDir);
    await initApp();
    patchAppInjectWithAuth(app);
    logger.setLogDir(path.join(testDir, 'logs'));
    app.post('/api/test-crash', async () => {
      throw new Error('intentional test crash');
    });
  });

  afterAll(() => {
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(async () => {
    const { getDb } = await import('../../src/db/database.js');
    const db = getDb();
    db.exec(`DELETE FROM files; DELETE FROM card_review_actions; DELETE FROM cards; DELETE FROM notes;
             DELETE FROM card_versions; DELETE FROM note_versions;
             DELETE FROM relations;
             DELETE FROM automation_runs; DELETE FROM automations;
             DELETE FROM provider_models; DELETE FROM api_keys; DELETE FROM providers;
             DELETE FROM daily_progress; DELETE FROM ui_settings;`);

    const { paths } = await import('../../src/utils/paths.js');
    fs.rmSync(paths.vaultDir, { recursive: true, force: true });

    const { aiManager, aiConfig } = await import('../../src/api/routes/ai.js');
    aiManager.reset();
    aiConfig.loadConfig();

    const { resetToolManager } = await import('../../src/ai/tool-manager.js');
    resetToolManager();

    global.fetch = originalFetch;
  });

  it('GET /api/health should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('should reject non-localhost CORS', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: { Origin: 'http://example.com' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('should accept localhost CORS', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
  });

  it('should accept 127.0.0.1 CORS', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        Origin: 'http://127.0.0.1:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
  });

  it('should return 404 for unmatched route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/nonexistent-route',
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Not found');
  });

  it('should return 500 with errorId on uncaught exception', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/test-crash',
      payload: { api_key: 'sk-secret-key-12345', data: 'test payload' },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');
    expect(body.errorId).toMatch(/^[a-f0-9]{8}$/);

    const logs = logger.getLogs('error', null).join('\n');
    expect(logs).toContain(body.errorId);
    expect(logs).toContain('POST /api/test-crash');
    expect(logs).toContain('intentional test crash');
    expect(logs).not.toContain('sk-secret-key-12345');
    expect(logs).toContain('sk-***45');
  });

  it('GET /api/ui-settings should return default UI settings', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/ui-settings',
    });

    expect(response.statusCode).toBe(200);
   expect(JSON.parse(response.body)).toEqual({
     success: true,
     settings: {
       chatPanelSide: 'right',
       language: 'zh-CN',
       fontSize: 'medium',
        dateFormat: 'yyyy-MM-dd',
     },
   });
 });

 it('POST /api/ui-settings should save valid partial UI settings', async () => {
   const response = await app.inject({
     method: 'POST',
     url: '/api/ui-settings',
     payload: { language: 'zh-TW', fontSize: 'large' },
   });

   expect(response.statusCode).toBe(200);
   expect(JSON.parse(response.body)).toEqual({
     success: true,
     settings: {
       chatPanelSide: 'right',
       language: 'zh-TW',
       fontSize: 'large',
        dateFormat: 'yyyy-MM-dd',
     },
   });
  });

  it('POST /api/ui-settings should reject invalid UI settings', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ui-settings',
      payload: { language: 'fr-FR' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ success: false, error: 'Invalid language' });
  });

  it('POST /api/ui-settings/sidebar should remain compatible', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/ui-settings/sidebar',
      payload: { chatPanelSide: 'left' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      success: true,
      settings: { chatPanelSide: 'left' },
    });
  });

  it('should create, update, list, and delete an automation', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/automations',
      payload: {
        name: 'Daily review',
        prompt: 'Summarize due cards',
        schedule: { kind: 'daily', hour: 9, minute: 0 },
        enabled: true,
        allowedTools: ['read_data_stats'],
        modelOverride: null,
        reasoningOverride: null,
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body).automation as {
      id: string;
      enabled: boolean;
      modelOverride: string | null;
    };
    expect(created.enabled).toBe(true);
    expect(created.modelOverride).toBeNull();

    const listResponse = await app.inject({ method: 'GET', url: '/api/automations' });
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.parse(listResponse.body).automations).toHaveLength(1);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/automations/${created.id}`,
      payload: { enabled: false, modelOverride: 'automation-test-model' },
    });
    expect(updateResponse.statusCode).toBe(200);
    const updated = JSON.parse(updateResponse.body).automation;
    expect(updated.nextRunAt).toBeNull();
    expect(updated.modelOverride).toBe('automation-test-model');

    const {
      claimAutomationRun,
      createAutomationRun,
      finishAutomationRun,
      getAutomationRun,
    } = await import('../../src/core/automations.js');
    const completedRun = createAutomationRun(created.id, 'manual', null);
    expect(claimAutomationRun(completedRun.id)).toBe(true);
    finishAutomationRun({
      runId: completedRun.id,
      status: 'succeeded',
      output: 'done',
      reasoning: '',
      toolCalls: [],
      error: null,
      model: 'automation-test-model',
      provider: 'test-provider',
    });

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/automations/${created.id}` });
    expect(deleteResponse.statusCode).toBe(200);
    expect(getAutomationRun(completedRun.id)).toBeNull();
  });

  it('should reject an automation with an unknown tool', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/automations',
      payload: {
        name: 'Unsafe task',
        prompt: 'Run an unknown tool',
        schedule: { kind: 'hourly', intervalHours: 1, minute: 0 },
        allowedTools: ['not_registered'],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('未知工具');
  });

  it('should reject an invalid schedule and an overlapping manual run', async () => {
    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/automations',
      payload: {
        name: 'Invalid schedule',
        prompt: 'Never run',
        schedule: { kind: 'weekly', daysOfWeek: [], hour: 9, minute: 0 },
      },
    });
    expect(invalidResponse.statusCode).toBe(400);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/automations',
      payload: {
        name: 'Concurrency guard',
        prompt: 'Read stats',
        schedule: { kind: 'hourly', intervalHours: 2, minute: 0 },
      },
    });
    const automationId = (JSON.parse(createResponse.body).automation as { id: string }).id;
    const { createAutomationRun } = await import('../../src/core/automations.js');
    createAutomationRun(automationId, 'manual', null);

    const conflictResponse = await app.inject({
      method: 'POST',
      url: `/api/automations/${automationId}/run`,
    });
    expect(conflictResponse.statusCode).toBe(409);
  });

  it('POST /api/cards should create a card', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'What is 2+2?', a: '4', tags: ['math'] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.card.q).toBe('What is 2+2?');
    expect(body.card.a).toBe('4');
  });

  it('GET /api/cards should list cards', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/cards',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('POST /api/notes should create a note', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Test Note', content: 'Hello world', folder: 'Test', tags: ['test'] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.note.title).toBe('Test Note');

    const { getDb } = await import('../../src/db/database.js');
    // 固定 SELECT 投影保证测试行只含 number；node:sqlite 的通用行类型无法从 SQL 字符串推导该字段。
    // 未在生产代码放宽类型：断言仅位于验证数据库副作用的测试边界。
    const progress = getDb().prepare(
      'SELECT notes_created FROM daily_progress WHERE notes_created > 0',
    ).get() as { notes_created: number } | undefined;
    expect(progress?.notes_created).toBe(1);
  });

  it('GET /api/search should search notes and cards', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/search?query=Test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('POST /api/markdown/render should render markdown', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/markdown/render',
      payload: { content: '# Hello\n\nWorld [link](https://example.com)' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.html).toContain('<h1>');
  });

  it('GET /api/config/ai should return masked config', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/config/ai',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.config.current_provider).toBeDefined();
    expect(body.config.title_provider).toBeDefined();
    expect(body.config.title_model).toBeDefined();
    expect(body.config.providers).toBeDefined();
  });

  it('POST /api/tools/config should update tool config', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/config',
      payload: { mode: 'auto', auto_execute_tools: [] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.config.mode).toBe('auto');
  });

  it('GET /api/tools/config should return tool config', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tools/config',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.config.mode).toBeDefined();
    expect(Array.isArray(body.config.auto_execute_tools)).toBe(true);
  });

  it('POST /api/tools/submit should auto-execute readonly tools', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/submit',
      payload: { tool_name: 'get_card_stats', params: {} },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.result).toBeDefined();
  });

  it('POST /api/tools/parse should parse AI response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/parse',
      payload: { response: 'Hello\n```json\n{"tool": "search_cards", "params": {"keyword": "test"}}\n```' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.tool_call).not.toBeNull();
    expect(body.data.tool_call.tool).toBe('search_cards');
  });

  it('GET /api/sessions should list sessions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/sessions',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  it('GET /api/mcp/health should return ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/mcp/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('mcp');
  });

  it('GET /api/mcp/notes should list notes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/mcp/notes',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
  });

  it('POST /api/mcp/notes/search should search notes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/mcp/notes/search',
      payload: { query: 'Test', limit: 10 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
  });

  it('POST /api/mcp/notes/search should match content when title and tag miss', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'XYZ', content: 'SearchMeContent', tags: ['xyz'] },
    });
    const noteId = JSON.parse(create.body).note.id;

    const response = await app.inject({
      method: 'POST',
      url: '/api/mcp/notes/search',
      payload: { query: 'searchme', limit: 10 },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.notes.some((n: { id: string }) => n.id === noteId)).toBe(true);
  });

  it('GET /api/review/next should return a card or empty', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/review/next',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.card === null || typeof body.card === 'object').toBe(true);
  });

  it('should keep collection review cards and statistics scoped to the requested tag', async () => {
    const alphaResponse = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'Alpha', a: 'A', tags: ['alpha'] },
    });
    await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'Beta', a: 'B', tags: ['beta'] },
    });
    const alphaCard = JSON.parse(alphaResponse.body).card;

    const nextResponse = await app.inject({
      method: 'GET',
      url: '/api/review/next?tag=alpha',
    });
    const nextBody = JSON.parse(nextResponse.body);
    expect(nextBody.card.id).toBe(alphaCard.id);
    expect(nextBody.due_count).toBe(1);
    expect(nextBody.total_count).toBe(1);

    const rateResponse = await app.inject({
      method: 'POST',
      url: `/api/review/${alphaCard.id}/rate?tag=alpha`,
      payload: { grade: 3 },
    });
    const rateBody = JSON.parse(rateResponse.body);
    expect(rateBody.next.card).toBeNull();
    expect(rateBody.next.due_count).toBe(0);
    expect(rateBody.next.total_count).toBe(1);
  });

  it('should persistently undo a rating and its daily progress exactly once', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'Undo', a: 'Me' },
    });
    const originalCard = JSON.parse(createResponse.body).card;

    const rateResponse = await app.inject({
      method: 'POST',
      url: `/api/review/${originalCard.id}/rate`,
      payload: { grade: 3 },
    });
    const rated = JSON.parse(rateResponse.body);
    expect(typeof rated.review_id).toBe('string');

    const undoResponse = await app.inject({
      method: 'POST',
      url: `/api/review/${originalCard.id}/undo`,
      payload: { review_id: rated.review_id },
    });
    expect(undoResponse.statusCode).toBe(200);
    const undone = JSON.parse(undoResponse.body);
    expect(undone.card).toMatchObject({
      id: originalCard.id,
      next_review: originalCard.next_review,
      interval: originalCard.interval,
    });

    const { getDb } = await import('../../src/db/database.js');
    const progress = getDb().prepare(
      'SELECT cards_reviewed FROM daily_progress WHERE cards_reviewed > 0',
    ).get();
    expect(progress).toBeUndefined();

    const repeatedUndo = await app.inject({
      method: 'POST',
      url: `/api/review/${originalCard.id}/undo`,
      payload: { review_id: rated.review_id },
    });
    expect(repeatedUndo.statusCode).toBe(409);
  });

  it('GET /api/progress/streak should return streak data', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { question: 'StreakQ', answer: 'StreakA' },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/streak',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(typeof body.current_streak).toBe('number');
  });

  it('GET /api/progress/streak should reset the longest streak across missing dates', async () => {
    const { getDb } = await import('../../src/db/database.js');
    const db = getDb();
    db.prepare(
      'INSERT INTO daily_progress (date, cards_reviewed) VALUES (?, ?)',
    ).run('2026-01-01', 2);
    db.prepare(
      'INSERT INTO daily_progress (date, cards_reviewed) VALUES (?, ?)',
    ).run('2026-01-03', 3);

    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/streak',
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).longest_streak).toBe(1);
  });

  it('GET /api/progress/history should return history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/history?days=7',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.history)).toBe(true);
  });

  it('GET /api/progress/heatmap should return heatmap data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/heatmap?days=30',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /api/progress/history should default days for invalid input', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/progress/history?days=abc',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.days).toBe(30);
  });

  it('POST /api/backup should create a backup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/backup',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(typeof body.path).toBe('string');
  });

  it('POST /api/import should import JSON data', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: {
        cards: [{ q: 'Q1', a: 'A1' }],
        notes: [{ title: 'Note1', content: 'Body' }],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(typeof body.imported).toBe('number');
  });

  it('GET /api/export should return cards and notes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/export',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.cards)).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);
  });

  it('POST /api/import should handle invalid data gracefully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/import',
      payload: { cards: 'not-an-array' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.imported).toBe(0);
  });

  it('POST /api/markdown/render should 400 without content', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/markdown/render',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('GET /api/search should return empty for missing query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/search',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.results).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('POST /api/cards should 400 without question or answer', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('POST /api/cards/import/txt should 400 for no valid cards', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/cards/import/txt',
      payload: { content: 'no tabs here' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('GET /api/review/next should return null when no cards due', async () => {
    const cardsRes = await app.inject({ method: 'GET', url: '/api/cards' });
    const cards = JSON.parse(cardsRes.body).cards as Array<{ id: string }>;
    for (const card of cards) {
      await app.inject({ method: 'POST', url: `/api/review/${card.id}/rate`, payload: { grade: 3 } });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/review/next',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.card).toBeNull();
  });

  it('GET /api/update/version should return version info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/update/version',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(typeof body.version).toBe('string');
    expect(typeof body.repository).toBe('string');
  });

  it('GET /api/update/check should handle failed fetch', async () => {
    const savedFetch = global.fetch;
    try {
      global.fetch = () => Promise.resolve({ ok: false, status: 500 } as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/update/check',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.data).toBeNull();
      expect(typeof body.message).toBe('string');
      expect(body.message.length).toBeGreaterThan(0);
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('GET /api/update/check should parse successful response', async () => {
    const savedFetch = global.fetch;
    try {
      global.fetch = () => Promise.resolve({
        ok: true,
        status: 200,
          json: () => Promise.resolve([{
            tag_name: 'v999.0.0',
          html_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v999.0.0',
          body: 'Release notes here',
          published_at: '2026-01-01T00:00:00Z',
          assets: [{ browser_download_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus.exe' }],
        }]),
      } as unknown as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/update/check',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.has_update).toBe(true);
      expect(body.data.latest_version).toBe('v999.0.0');
      expect(body.data.current_version).toBeDefined();
      expect(body.data.release_url).toBe('https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v999.0.0');
      expect(body.data.download_url).toBe('https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus.exe');
      expect(body.data.release_notes).toBe('Release notes here');
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('GET /api/update/check should select the matching macOS architecture asset', async () => {
    const savedFetch = global.fetch;
    try {
      global.fetch = () => Promise.resolve(new Response(JSON.stringify([{
        tag_name: 'v999.0.0',
        html_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v999.0.0',
        body: null,
        published_at: '2026-01-01T00:00:00Z',
        assets: [
          { browser_download_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus-Setup.exe' },
          { browser_download_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus-Desktop-macOS-x64.dmg' },
          { browser_download_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus-Desktop-macOS-arm64.dmg' },
        ],
      }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/update/check',
        headers: {
          'x-papyrus-platform': 'darwin',
          'x-papyrus-arch': 'arm64',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.download_url).toBe(
        'https://github.com/PapyrusOR/Papyrus_Desktop/releases/download/v999.0.0/Papyrus-Desktop-macOS-arm64.dmg',
      );
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('GET /api/update/check should keep Beta on the prerelease-aware channel and reject downgrade', async () => {
    const savedFetch = global.fetch;
    const requestedUrls: string[] = [];
    try {
      global.fetch = (input) => {
        requestedUrls.push(String(input));
        return Promise.resolve(new Response(JSON.stringify([
          {
            tag_name: 'v1.9.9',
            html_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v1.9.9',
            body: 'Older stable release',
            published_at: '2026-01-01T00:00:00Z',
            assets: [],
          },
          {
            tag_name: 'v2.0.0-beta.13',
            html_url: 'https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v2.0.0-beta.13',
            body: 'Previous Beta release',
            published_at: '2026-01-02T00:00:00Z',
            assets: [],
          },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      };

      const response = await app.inject({
        method: 'GET',
        url: '/api/update/check',
        headers: {
          'x-papyrus-app-version': '2.0.0-beta.16',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.current_version).toBe('2.0.0-beta.16');
      expect(body.data.latest_version).toBe('v2.0.0-beta.13');
      expect(body.data.has_update).toBe(false);
      expect(requestedUrls[0]).toContain('/releases?per_page=30');
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('POST /api/config/ai/test should test ollama connection', async () => {
    const savedFetch = global.fetch;
    try {
      global.fetch = () => Promise.resolve({ ok: true, status: 200 } as Response);

      await app.inject({
        method: 'POST',
        url: '/api/config/ai',
        payload: {
          current_provider: 'ollama',
          current_model: 'llama2',
          providers: {},
          parameters: { temperature: 0.7, top_p: 1, max_tokens: 2000, presence_penalty: 0, frequency_penalty: 0 },
          features: { auto_hint: false, auto_explain: false, context_length: 5, agent_enabled: false },
        },
      });

      const providerId = saveProvider({
        id: 'p-ollama-test', type: 'ollama', name: 'ollama',
        baseUrl: 'http://localhost:11434', enabled: true, isDefault: true,
      });
      saveApiKey(providerId, { id: 'k-ollama', name: 'default', key: '' });
      saveModel(providerId, { id: 'm-llama2', modelId: 'llama2', name: 'llama2', enabled: true });

      const { aiConfig } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama2';

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/ai/test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(typeof body.success).toBe('boolean');
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('POST /api/config/ai/test should reject private url', async () => {
    saveProvider({ id: 'p-openai', type: 'openai', name: 'OpenAI', baseUrl: 'http://192.168.1.1/v1', enabled: true, isDefault: false });
    saveApiKey('p-openai', { id: 'k-openai', name: 'default', key: 'sk-test' });
    saveModel('p-openai', { id: 'm-gpt4', modelId: 'gpt-4', name: 'gpt-4', enabled: true });

    const { aiConfig } = await import('../../src/api/routes/ai.js');
    aiConfig.config.current_provider = 'openai';
    aiConfig.config.current_model = 'gpt-4';

    const response = await app.inject({
      method: 'POST',
      url: '/api/config/ai/test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('SSRF');
  });

  it('POST /api/config/ai/test should report missing api key', async () => {
    const providerId = saveProvider({
      id: 'p-openai-test', type: 'openai', name: 'openai',
      baseUrl: 'https://api.openai.com/v1', enabled: true, isDefault: false,
    });
    saveApiKey(providerId, { id: 'k-openai', name: 'default', key: '' });
    saveModel(providerId, { id: 'm-gpt4', modelId: 'gpt-4', name: 'gpt-4', enabled: true });

    const { aiConfig } = await import('../../src/api/routes/ai.js');
    aiConfig.config.current_provider = 'openai';
    aiConfig.config.current_model = 'gpt-4';

    const response = await app.inject({
      method: 'POST',
      url: '/api/config/ai/test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('API Key');
  });

  it('POST /api/config/ai/test should report missing base url', async () => {
    const providerId = saveProvider({
      id: 'p-openai-test2', type: 'openai', name: 'openai',
      baseUrl: '', enabled: true, isDefault: false,
    });
    saveApiKey(providerId, { id: 'k-openai2', name: 'default', key: 'sk-test' });
    saveModel(providerId, { id: 'm-gpt4b', modelId: 'gpt-4', name: 'gpt-4', enabled: true });

    const { aiConfig } = await import('../../src/api/routes/ai.js');
    aiConfig.config.current_provider = 'openai';
    aiConfig.config.current_model = 'gpt-4';

    const response = await app.inject({
      method: 'POST',
      url: '/api/config/ai/test',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Base URL');
  });

  it('POST /api/config/ai/test should handle 401 response', async () => {
    const savedFetch = global.fetch;
    try {
      global.fetch = () => Promise.resolve({ ok: false, status: 401 } as Response);

      const providerId = saveProvider({
        id: 'p-openai-401', type: 'openai', name: 'openai',
        baseUrl: 'https://api.openai.com/v1', enabled: true, isDefault: false,
      });
      saveApiKey(providerId, { id: 'k-401', name: 'default', key: 'sk-test' });
      saveModel(providerId, { id: 'm-401', modelId: 'gpt-4', name: 'gpt-4', enabled: true });

      const { aiConfig } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'openai';
      aiConfig.config.current_model = 'gpt-4';

      const response = await app.inject({
        method: 'POST',
        url: '/api/config/ai/test',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('无效');
    } finally {
      global.fetch = savedFetch;
    }
  });

  it('GET /api/tools/catalog should return tool catalog', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tools/catalog',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
  });

  it('GET /api/tools/pending should return pending calls', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tools/pending',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.calls)).toBe(true);
  });

  it('POST /api/tools/submit should create pending call for write tools', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tools/config',
      payload: { mode: 'manual', auto_execute_tools: [] },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/submit',
      payload: { tool_name: 'create_card', params: { question: 'Q', answer: 'A' } },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.call).toBeDefined();
    expect(body.call.call_id).toBeTruthy();
  });

  it('POST /api/tools/approve/:callId should 404 for non-existent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/approve/no-such-id',
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('POST /api/tools/reject/:callId should 404 for non-existent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/reject/no-such-id',
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('GET /api/tools/calls/:callId should 404 for non-existent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/tools/calls/no-such-id',
    });
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('DELETE /api/tools/history should clear history', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/tools/history?keep_pending=true',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(typeof body.cleared_count).toBe('number');
  });

  it('POST /api/tools/approve/:callId should handle execution error', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tools/config',
      payload: { mode: 'manual', auto_execute_tools: [] },
    });

    const submit = await app.inject({
      method: 'POST',
      url: '/api/tools/submit',
      payload: { tool_name: 'create_card', params: { question: 'Q', answer: 'A' } },
    });
    const callId = JSON.parse(submit.body).call?.call_id;
    expect(callId).toBeTruthy();

    const { CardTools } = await import('../../src/ai/tools.js');
    const original = CardTools.prototype.executeTool;
    CardTools.prototype.executeTool = () => { throw new Error('tool crash'); };

    const response = await app.inject({
      method: 'POST',
      url: `/api/tools/approve/${callId}`,
    });

    CardTools.prototype.executeTool = original;

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('tool crash');
  });

  it('POST /api/tools/submit should handle auto-execute error', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tools/config',
      payload: { mode: 'auto', auto_execute_tools: [] },
    });

    const { CardTools } = await import('../../src/ai/tools.js');
    const original = CardTools.prototype.executeTool;
    CardTools.prototype.executeTool = () => { throw new Error('auto crash'); };

    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/submit',
      payload: { tool_name: 'get_card_stats', params: {} },
    });

    CardTools.prototype.executeTool = original;

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('auto crash');
  });

  it('POST /api/tools/submit should persist failed auto-execute validation result for auditability', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tools/config',
      payload: { mode: 'auto', auto_execute_tools: [] },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/submit',
      payload: { tool_name: 'create_card', params: { question: '', answer: '' } },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.result.success).toBe(false);
    expect(body.result.error).toContain('question');
    expect(body.call.status).toBe('success');
    expect(body.call.result.success).toBe(false);
    expect(body.call.result.error).toContain('question');
  });

  it('POST /api/tools/parse should preserve reasoning when tool JSON is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/tools/parse',
      payload: {
        response: '<think>check malformed tool</think>\n```json\nnot-json\n```',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.reasoning).toBe('check malformed tool');
    expect(body.data.tool_call).toBeNull();
    expect(body.data.content).toBe('```json\nnot-json\n```');
  });

  it('GET /api/notes/:noteId/history should return versions', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Versioned', content: 'v1' },
    });
    const noteId = JSON.parse(create.body).note.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: { content: 'v2' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/history`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.history[0].content).toBe('v1');
  });

  it('GET /api/notes/:noteId/history should 404 for non-existent note', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/notes/non-existent-id/history',
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('POST /api/notes/:noteId/rollback/:versionId should roll back note', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/notes',
      payload: { title: 'Versioned', content: 'v1' },
    });
    const noteId = JSON.parse(create.body).note.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/notes/${noteId}`,
      payload: { content: 'v2' },
    });

    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/notes/${noteId}/history`,
    });
    const versionId = JSON.parse(historyRes.body).history[0].version_id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/notes/${noteId}/rollback/${versionId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.note.content).toBe('v1');
  });

  it('GET /api/cards/:cardId/history should return versions', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'Q1', a: 'A1' },
    });
    const cardId = JSON.parse(create.body).card.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${cardId}`,
      payload: { q: 'Q2' },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/cards/${cardId}/history`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.count).toBe(1);
    expect(body.history[0].q).toBe('Q1');
  });

  it('GET /api/cards/:cardId/history should 404 for non-existent card', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/cards/non-existent-id/history',
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).success).toBe(false);
  });

  it('POST /api/cards/:cardId/rollback/:versionId should roll back card', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { q: 'Q1', a: 'A1' },
    });
    const cardId = JSON.parse(create.body).card.id;

    await app.inject({
      method: 'PATCH',
      url: `/api/cards/${cardId}`,
      payload: { q: 'Q2' },
    });

    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/cards/${cardId}/history`,
    });
    const versionId = JSON.parse(historyRes.body).history[0].version_id;

    const response = await app.inject({
      method: 'POST',
      url: `/api/cards/${cardId}/rollback/${versionId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.card.q).toBe('Q1');
  });

  describe('Files API', () => {
    it('GET /api/files should return empty list initially', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/files' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.files).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('POST /api/files/folder should create a folder', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/files/folder',
        payload: { name: 'Test Folder' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.file.name).toBe('Test Folder');
      expect(body.file.is_folder).toBe(1);
    });

    it('POST /api/files/folder should reject empty name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/files/folder',
        payload: { name: '  ' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/files/upload should upload files', async () => {
      const content = Buffer.from('Hello API').toString('base64');
      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: {
          files: [{ name: 'api-test.txt', content, mimeType: 'text/plain' }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.count).toBe(1);
      expect(body.files[0].name).toBe('api-test.txt');
      expect(body.files[0].size).toBe(9);
    });

    it('POST /api/files/upload should return saved files and per-file errors for mixed payloads', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: {
          files: [
            { name: 'valid.txt', content: Buffer.from('valid').toString('base64'), mimeType: 'text/plain' },
            { name: '', content: Buffer.from('missing name').toString('base64'), mimeType: 'text/plain' },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.count).toBe(1);
      expect(body.files).toEqual([
        expect.objectContaining({ name: 'valid.txt', size: 5 }),
      ]);
      expect(body.errors).toEqual([
        { name: '(未命名)', error: '缺少名称或内容' },
      ]);
    });

    it('POST /api/files/upload should reject empty file list', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: { files: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /api/files/:id should return single file', async () => {
      const content = Buffer.from('single file').toString('base64');
      const upload = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: { files: [{ name: 'single.txt', content, mimeType: 'text/plain' }] },
      });
      const fileId = JSON.parse(upload.body).files[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fileId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.file.id).toBe(fileId);
    });

    it('GET /api/files/:id/download should return file headers', async () => {
      const content = Buffer.from('download content').toString('base64');
      const upload = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: { files: [{ name: 'download.txt', content, mimeType: 'text/plain' }] },
      });
      const fileId = JSON.parse(upload.body).files[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fileId}/download`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-disposition']).toContain('download.txt');
    });

    it('GET /api/files/:id/download should 404 for non-existent file', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files/non-existent/download',
      });

      expect(response.statusCode).toBe(404);
    });

    it('GET /api/files/:id/preview should return file with inline disposition', async () => {
      const content = Buffer.from('preview content').toString('base64');
      const upload = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: { files: [{ name: 'preview.txt', content, mimeType: 'text/plain' }] },
      });
      const fileId = JSON.parse(upload.body).files[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fileId}/preview`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/plain');
      expect(response.headers['content-disposition']).toBe('inline');
    });

    it('GET /api/files/:id/preview should 404 for non-existent file', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/files/non-existent/preview',
      });

      expect(response.statusCode).toBe(404);
    });

    it('GET /api/files/:id/thumbnail should reject non-image files', async () => {
      const upload = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: {
          files: [{ name: 'not-image.txt', content: Buffer.from('plain').toString('base64'), mimeType: 'text/plain' }],
        },
      });
      const fileId = JSON.parse(upload.body).files[0].id;

      const response = await app.inject({
        method: 'GET',
        url: `/api/files/${fileId}/thumbnail`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('图片');
    });

    it('DELETE /api/files/:id should delete a file', async () => {
      const content = Buffer.from('delete me').toString('base64');
      const upload = await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: { files: [{ name: 'delete-me.txt', content }] },
      });
      const fileId = JSON.parse(upload.body).files[0].id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/files/${fileId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(1);
    });

    it('DELETE /api/files/:id should 404 for non-existent file', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/files/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('DELETE /api/files/:id should recursively delete folder', async () => {
      const folder = await app.inject({
        method: 'POST',
        url: '/api/files/folder',
        payload: { name: 'Delete Folder' },
      });
      const folderId = JSON.parse(folder.body).file.id;

      const content = Buffer.from('nested').toString('base64');
      await app.inject({
        method: 'POST',
        url: '/api/files/upload',
        payload: {
          files: [
            { name: 'nested-a.txt', content },
            { name: 'nested-b.txt', content },
          ],
          parentId: folderId,
        },
      });

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/files/${folderId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).deleted).toBe(3);

      const getRes = await app.inject({ method: 'GET', url: '/api/files' });
      const files = JSON.parse(getRes.body).files;
      expect(files.some((f: { id: string }) => f.id === folderId)).toBe(false);
    });
  });

  describe('Extensions API', () => {
    it('GET /api/extensions should return extensions list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/extensions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.extensions)).toBe(true);
    });

    it('POST /api/extensions should install an extension', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'test-ext', name: 'Test Extension', description: 'A test extension' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.extension.name).toBe('Test Extension');
    });

    it('POST /api/extensions should reject duplicate id', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'dup-ext', name: 'Dup Extension' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'dup-ext', name: 'Dup Extension' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('GET /api/extensions/:id should return single extension', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'get-ext', name: 'Get Extension' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/extensions/get-ext',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.extension.id).toBe('get-ext');
    });

    it('GET /api/extensions/:id should 404 for non-existent', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/extensions/non-existent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('POST /api/extensions/:id/enabled should toggle extension', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'toggle-ext', name: 'Toggle Extension' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/extensions/toggle-ext/enabled',
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('DELETE /api/extensions/:id should uninstall extension', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/extensions',
        payload: { id: 'del-ext', name: 'Delete Extension' },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/extensions/del-ext',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('Providers API', () => {
    it('GET /api/providers should list providers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/providers',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.providers)).toBe(true);
    });

    it('POST /api/providers should validate request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).success).toBe(false);
    });

    it('POST /api/providers should create provider with api keys and models', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-create-1',
          type: 'openai',
          name: 'Created Provider',
          baseUrl: 'https://provider.example.com',
          enabled: true,
          apiKeys: [{ id: 'key-create-1', name: 'default', key: 'sk-created' }],
          models: [{ id: 'model-create-1', name: 'GPT Create', modelId: 'gpt-create', enabled: true }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.provider.id).toBe('provider-create-1');

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/providers',
      });
      const listBody = JSON.parse(listResponse.body);
      const provider = (listBody.providers as Array<{
        id: string;
        apiKeys: Array<{ id: string; key: string }>;
        models: Array<{ id: string; modelId: string }>;
      }>).find((item) => item.id === 'provider-create-1');

      expect(provider).toBeDefined();
      expect(provider?.apiKeys[0]?.id).toBe('key-create-1');
      expect(provider?.models[0]?.modelId).toBe('gpt-create');
    });

    it('PUT /api/providers/:providerId should update provider and prune removed api keys', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-update-1',
          type: 'openai',
          name: 'Original Provider',
          baseUrl: 'https://original.example.com',
          enabled: true,
          apiKeys: [
            { id: 'key-keep', name: 'keep', key: 'sk-keep' },
            { id: 'key-drop', name: 'drop', key: 'sk-drop' },
          ],
        },
      });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/providers/provider-update-1',
        payload: {
          type: 'openai',
          name: 'Updated Provider',
          baseUrl: 'https://updated.example.com',
          enabled: false,
          apiKeys: [{ id: 'key-keep', name: 'keep', key: 'sk-keep-2' }],
        },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/providers',
      });
      const listBody = JSON.parse(listResponse.body);
      const provider = (listBody.providers as Array<{
        id: string;
        name: string;
        enabled: boolean;
        apiKeys: Array<{ id: string; key: string }>;
      }>).find((item) => item.id === 'provider-update-1');

      expect(provider?.name).toBe('Updated Provider');
      expect(provider?.enabled).toBe(false);
      expect(provider?.apiKeys.map((item) => item.id)).toEqual(['key-keep']);
      expect(provider?.apiKeys[0]?.hasKey).toBe(true);
      expect(provider?.apiKeys[0]?.key).toMatch(/^\*+$/);
    });

    it('POST /api/providers/:providerId/default should set default provider', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-default-1',
          type: 'gemini',
          name: 'Gemini Default',
          baseUrl: 'https://gemini.example.com',
          enabled: true,
          isDefault: false,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-default-1/default',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/providers',
      });
      const provider = (JSON.parse(listResponse.body).providers as Array<{
        id: string;
        isDefault: boolean;
      }>).find((item) => item.id === 'provider-default-1');
      expect(provider?.isDefault).toBe(true);
    });

    it('POST /api/providers/:providerId/enabled should validate and update status', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-enabled-1',
          type: 'anthropic',
          name: 'Anthropic Toggle',
          enabled: false,
        },
      });

      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-enabled-1/enabled',
        payload: { enabled: 'yes' },
      });
      expect(invalidResponse.statusCode).toBe(400);

      const response = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-enabled-1/enabled',
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).success).toBe(true);
    });

    it('provider model endpoints should cover validation, foreign-key, and delete branches', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-model-1',
          type: 'openai',
          name: 'Model Provider',
          enabled: true,
        },
      });

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-model-1/models',
        payload: { id: 'model-route-1', name: 'GPT Route', modelId: 'gpt-route', enabled: true },
      });
      expect(createResponse.statusCode).toBe(200);

      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-model-1/models',
        payload: { id: 'model-route-2', name: '', modelId: '', enabled: true },
      });
      expect(invalidResponse.statusCode).toBe(400);

      const badForeignKeyResponse = await app.inject({
        method: 'PUT',
        url: '/api/providers/provider-model-1/models/model-route-1',
        payload: {
          name: 'GPT Route Updated',
          modelId: 'gpt-route',
          apiKeyId: 'missing-api-key',
          enabled: true,
        },
      });
      expect(badForeignKeyResponse.statusCode).toBe(400);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/providers/provider-model-1/models/missing-model',
      });
      expect(deleteMissingResponse.statusCode).toBe(404);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/providers/provider-model-1/models/model-route-1',
      });
      expect(deleteResponse.statusCode).toBe(200);
    });

    it('should clear dedicated title targets when their provider or model becomes unavailable', async () => {
      const { aiConfig } = await import('../../src/api/routes/ai.js');
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-title-cleanup',
          type: 'title-cleanup',
          name: 'Title Cleanup Provider',
          enabled: true,
          models: [
            {
              id: 'model-title-cleanup',
              name: 'Title Cleanup Model',
              modelId: 'title-cleanup-model',
              enabled: true,
            },
          ],
        },
      });

      aiConfig.config.title_provider = 'title-cleanup';
      aiConfig.config.title_model = 'title-cleanup-model';
      aiConfig.saveConfig();
      const disableProviderResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-title-cleanup/enabled',
        payload: { enabled: false },
      });
      expect(disableProviderResponse.statusCode).toBe(200);
      expect(aiConfig.config.title_provider).toBe('');
      expect(aiConfig.config.title_model).toBe('');

      await app.inject({
        method: 'POST',
        url: '/api/providers/provider-title-cleanup/enabled',
        payload: { enabled: true },
      });
      aiConfig.config.title_provider = 'title-cleanup';
      aiConfig.config.title_model = 'title-cleanup-model';
      aiConfig.saveConfig();
      const deleteModelResponse = await app.inject({
        method: 'DELETE',
        url: '/api/providers/provider-title-cleanup/models/model-title-cleanup',
      });
      expect(deleteModelResponse.statusCode).toBe(200);
      expect(aiConfig.config.title_provider).toBe('');
      expect(aiConfig.config.title_model).toBe('');
    });

    it('provider api key endpoints should validate, create, and delete', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-key-1',
          type: 'openai',
          name: 'Key Provider',
          enabled: true,
        },
      });

      const invalidResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-key-1/apikeys',
        payload: { name: '', key: 'sk-test' },
      });
      expect(invalidResponse.statusCode).toBe(400);

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/providers/provider-key-1/apikeys',
        payload: { name: 'default', key: 'sk-test' },
      });
      expect(createResponse.statusCode).toBe(200);
      const keyId = JSON.parse(createResponse.body).keyId as string;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/providers/provider-key-1/apikeys/${keyId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);
    });

    it('DELETE /api/providers/:providerId should return 404 for missing provider', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/providers/missing-provider',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('AI Sessions and Messages API', () => {
    it('POST /api/sessions should reuse an existing blank session when no title is provided', async () => {
      const clearResponse = await app.inject({
        method: 'DELETE',
        url: '/api/sessions',
      });
      expect(clearResponse.statusCode).toBe(200);

      const firstResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {},
      });
      const secondResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: {},
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);

      const firstSession = JSON.parse(firstResponse.body).session;
      const secondSession = JSON.parse(secondResponse.body).session;
      expect(firstSession.messageCount).toBe(0);
      expect(secondSession.id).toBe(firstSession.id);

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/sessions',
      });
      const blankSessions = JSON.parse(listResponse.body).sessions
        .filter((session: { messageCount: number }) => session.messageCount === 0);
      expect(blankSessions).toHaveLength(1);
    });

    it('session endpoints should create, rename, switch, list and delete sessions', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { title: 'Session Alpha' },
      });
      expect(createResponse.statusCode).toBe(200);
      const createdSessionId = JSON.parse(createResponse.body).session.id as string;

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/sessions',
      });
      expect(listResponse.statusCode).toBe(200);
      expect(JSON.parse(listResponse.body).sessions.some((item: { id: string }) => item.id === createdSessionId)).toBe(true);

      const invalidRenameResponse = await app.inject({
        method: 'PATCH',
        url: `/api/sessions/${createdSessionId}`,
        payload: {},
      });
      expect(invalidRenameResponse.statusCode).toBe(400);

      const renameResponse = await app.inject({
        method: 'PATCH',
        url: `/api/sessions/${createdSessionId}`,
        payload: { title: 'Session Beta' },
      });
      expect(renameResponse.statusCode).toBe(200);
      expect(JSON.parse(renameResponse.body).session.title).toBe('Session Beta');

      const invalidSwitchResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions/missing-session/switch',
      });
      expect(invalidSwitchResponse.statusCode).toBe(400);

      const switchResponse = await app.inject({
        method: 'POST',
        url: `/api/sessions/${createdSessionId}/switch`,
      });
      expect(switchResponse.statusCode).toBe(200);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/sessions/missing-session',
      });
      expect(deleteMissingResponse.statusCode).toBe(400);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/sessions/${createdSessionId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(JSON.parse(deleteResponse.body).success).toBe(true);

      const clearResponse = await app.inject({
        method: 'DELETE',
        url: '/api/sessions',
      });
      expect(clearResponse.statusCode).toBe(200);
      expect(JSON.parse(clearResponse.body).deletedCount).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/sessions/:sessionId/generate-title should validate and return the generated session', async () => {
      const { aiManager } = await import('../../src/api/routes/ai.js');
      const originalGenerateSessionTitle = aiManager.generateSessionTitle.bind(aiManager);

      const missingResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions/missing-session/generate-title',
      });
      expect(missingResponse.statusCode).toBe(404);

      const blankSession = aiManager.createSession('Blank session', true);
      const blankResponse = await app.inject({
        method: 'POST',
        url: `/api/sessions/${blankSession.id}/generate-title`,
      });
      expect(blankResponse.statusCode).toBe(400);

      const session = aiManager.createSession('Manual title', true);
      await aiManager.persistUserMessage(session.id, 'Explain spaced repetition', []);
      aiManager.generateSessionTitle = async (sessionId) => {
        const current = aiManager.getSession(sessionId);
        return current ? { ...current, title: 'Spaced Repetition Guide' } : null;
      };

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/sessions/${session.id}/generate-title`,
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toMatchObject({
          success: true,
          session: {
            id: session.id,
            title: 'Spaced Repetition Guide',
          },
        });
      } finally {
        aiManager.generateSessionTitle = originalGenerateSessionTitle;
      }
    });

    it('POST /api/sessions/:sessionId/generate-title should keep failures non-destructive', async () => {
      const { aiManager } = await import('../../src/api/routes/ai.js');
      const originalGenerateSessionTitle = aiManager.generateSessionTitle.bind(aiManager);
      const session = aiManager.createSession('Keep this title', true);
      await aiManager.persistUserMessage(session.id, 'Generate a title', []);
      aiManager.generateSessionTitle = async () => {
        throw new Error('title provider offline');
      };

      try {
        const response = await app.inject({
          method: 'POST',
          url: `/api/sessions/${session.id}/generate-title`,
        });

        expect(response.statusCode).toBe(502);
        expect(JSON.parse(response.body).error).toBe('title provider offline');
        expect(aiManager.getSession(session.id)?.title).toBe('Keep this title');
      } finally {
        aiManager.generateSessionTitle = originalGenerateSessionTitle;
      }
    });

    it('message endpoints should validate payload, persist message and delete it', async () => {
      const createSessionResponse = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        payload: { title: 'Message Session' },
      });
      const sessionId = JSON.parse(createSessionResponse.body).session.id as string;

      const invalidSessionResponse = await app.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { role: 'assistant', content: 'hello' },
      });
      expect(invalidSessionResponse.statusCode).toBe(400);

      const invalidRoleResponse = await app.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { sessionId, role: 'system', content: 'hello' },
      });
      expect(invalidRoleResponse.statusCode).toBe(400);

      const invalidContentResponse = await app.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { sessionId, role: 'assistant', content: '' },
      });
      expect(invalidContentResponse.statusCode).toBe(400);

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/messages',
        payload: {
          sessionId,
          role: 'assistant',
          content: 'Saved assistant message',
          blocks: [
            { type: 'text', text: 'Saved assistant message' },
            { type: 'tool_result', toolName: 'get_card_stats', toolStatus: 'success', toolResult: { total: 0 } },
          ],
          model: 'gpt-test',
          provider: 'openai',
        },
      });
      expect(createResponse.statusCode).toBe(200);
      const messageId = JSON.parse(createResponse.body).messageId as string;
      expect(messageId).toBeTruthy();

      const missingMessagesResponse = await app.inject({
        method: 'GET',
        url: '/api/sessions/missing-session/messages',
      });
      expect(missingMessagesResponse.statusCode).toBe(404);

      const listMessagesResponse = await app.inject({
        method: 'GET',
        url: `/api/sessions/${sessionId}/messages`,
      });
      expect(listMessagesResponse.statusCode).toBe(200);
      const messagesBody = JSON.parse(listMessagesResponse.body);
      expect(messagesBody.messages.some((item: { id: string }) => item.id === messageId)).toBe(true);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/messages/missing-message',
      });
      expect(deleteMissingResponse.statusCode).toBe(404);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/messages/${messageId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);
    });
  });

  describe('Relations API', () => {
    it('relations endpoints should cover lookup, graph, create, update and delete', async () => {
      const noteAResponse = await app.inject({
        method: 'POST',
        url: '/api/notes',
        payload: { title: 'Relation A', content: 'Alpha content' },
      });
      const noteBResponse = await app.inject({
        method: 'POST',
        url: '/api/notes',
        payload: { title: 'Relation B', content: 'Beta content' },
      });

      const noteAId = JSON.parse(noteAResponse.body).note.id as string;
      const noteBId = JSON.parse(noteBResponse.body).note.id as string;

      const missingRelationsResponse = await app.inject({
        method: 'GET',
        url: '/api/notes/missing-note/relations',
      });
      expect(missingRelationsResponse.statusCode).toBe(404);

      const emptyRelationsResponse = await app.inject({
        method: 'GET',
        url: `/api/notes/${noteAId}/relations`,
      });
      expect(emptyRelationsResponse.statusCode).toBe(200);
      expect(JSON.parse(emptyRelationsResponse.body).outgoing).toEqual([]);

      const invalidSearchResponse = await app.inject({
        method: 'GET',
        url: '/api/notes/search-for-relation',
      });
      expect(invalidSearchResponse.statusCode).toBe(400);

      const searchResponse = await app.inject({
        method: 'GET',
        url: `/api/notes/search-for-relation?query=Relation&exclude_note_id=${noteAId}&limit=99`,
      });
      expect(searchResponse.statusCode).toBe(200);
      const searchBody = JSON.parse(searchResponse.body);
      expect(searchBody.results.some((item: { id: string }) => item.id === noteBId)).toBe(true);

      const missingGraphResponse = await app.inject({
        method: 'GET',
        url: '/api/notes/missing-note/graph',
      });
      expect(missingGraphResponse.statusCode).toBe(404);

      const selfRelationResponse = await app.inject({
        method: 'POST',
        url: `/api/notes/${noteAId}/relations`,
        payload: { target_id: noteAId },
      });
      expect(selfRelationResponse.statusCode).toBe(400);

      const missingTargetResponse = await app.inject({
        method: 'POST',
        url: `/api/notes/${noteAId}/relations`,
        payload: { target_id: 'missing-note' },
      });
      expect(missingTargetResponse.statusCode).toBe(404);

      const createRelationResponse = await app.inject({
        method: 'POST',
        url: `/api/notes/${noteAId}/relations`,
        payload: { target_id: noteBId, relation_type: 'reference', description: 'A to B' },
      });
      expect(createRelationResponse.statusCode).toBe(200);
      const relationId = JSON.parse(createRelationResponse.body).relation_id as string;

      const duplicateRelationResponse = await app.inject({
        method: 'POST',
        url: `/api/notes/${noteAId}/relations`,
        payload: { target_id: noteBId, relation_type: 'reference', description: 'duplicate' },
      });
      expect(duplicateRelationResponse.statusCode).toBe(409);

      const graphResponse = await app.inject({
        method: 'GET',
        url: `/api/notes/${noteAId}/graph?depth=3`,
      });
      expect(graphResponse.statusCode).toBe(200);
      const graphBody = JSON.parse(graphResponse.body);
      expect(graphBody.nodes.length).toBeGreaterThanOrEqual(2);

      const relationsResponse = await app.inject({
        method: 'GET',
        url: `/api/notes/${noteAId}/relations`,
      });
      expect(relationsResponse.statusCode).toBe(200);
      expect(JSON.parse(relationsResponse.body).outgoing[0].title).toBe('Relation B');

      const updateMissingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/relations/missing-relation',
        payload: { relation_type: 'seealso' },
      });
      expect(updateMissingResponse.statusCode).toBe(404);

      const updateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/relations/${relationId}`,
        payload: { relation_type: 'seealso', description: 'updated' },
      });
      expect(updateResponse.statusCode).toBe(200);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/relations/missing-relation',
      });
      expect(deleteMissingResponse.statusCode).toBe(404);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/relations/${relationId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);
    });
  });

  describe('Notes and MCP API Additional Coverage', () => {
    it('notes endpoints should cover get, patch, delete, batch delete and import validation', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/notes',
        payload: { title: 'Extra Note', content: 'body', folder: 'Inbox', tags: ['x'] },
      });
      const noteId = JSON.parse(createResponse.body).note.id as string;

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/notes/${noteId}`,
      });
      expect(getResponse.statusCode).toBe(200);

      const getMissingResponse = await app.inject({
        method: 'GET',
        url: '/api/notes/missing-note',
      });
      expect(getMissingResponse.statusCode).toBe(404);

      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/api/notes/${noteId}`,
        payload: { title: 'Extra Note Updated', content: 'updated body' },
      });
      expect(patchResponse.statusCode).toBe(200);

      const patchMissingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/notes/missing-note',
        payload: { title: 'Nope' },
      });
      expect(patchMissingResponse.statusCode).toBe(404);

      const batchInvalidResponse = await app.inject({
        method: 'POST',
        url: '/api/notes/batch-delete',
        payload: {},
      });
      expect(batchInvalidResponse.statusCode).toBe(400);

      const createResponse2 = await app.inject({
        method: 'POST',
        url: '/api/notes',
        payload: { title: 'Extra Note 2', content: 'body 2' },
      });
      const noteId2 = JSON.parse(createResponse2.body).note.id as string;

      const batchDeleteResponse = await app.inject({
        method: 'POST',
        url: '/api/notes/batch-delete',
        payload: { ids: [noteId, noteId2] },
      });
      expect(batchDeleteResponse.statusCode).toBe(200);
      expect(JSON.parse(batchDeleteResponse.body).deleted).toBe(2);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/notes/missing-note',
      });
      expect(deleteMissingResponse.statusCode).toBe(404);

      const obsidianMissingResponse = await app.inject({
        method: 'POST',
        url: '/api/notes/import/obsidian',
        payload: {},
      });
      expect(obsidianMissingResponse.statusCode).toBe(400);

      const obsidianIllegalPathResponse = await app.inject({
        method: 'POST',
        url: '/api/notes/import/obsidian',
        payload: { vault_path: 'bad\u0000path' },
      });
      expect(obsidianIllegalPathResponse.statusCode).toBe(400);

      const obsidianOutsideHomeResponse = await app.inject({
        method: 'POST',
        url: '/api/notes/import/obsidian',
        payload: { vault_path: path.parse(testDir).root },
      });
      expect(obsidianOutsideHomeResponse.statusCode).toBe(400);
    });

    it('mcp endpoints should cover note CRUD, search and vault read flows', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/notes',
        payload: { title: 'MCP Note', content: 'Tagged content', tags: ['mcp-tag'] },
      });
      expect(createResponse.statusCode).toBe(200);
      const createdNoteId = JSON.parse(createResponse.body).note.id as string;

      const invalidCreateResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/notes',
        payload: { title: '' },
      });
      expect(invalidCreateResponse.statusCode).toBe(400);

      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/mcp/notes/${createdNoteId}`,
      });
      expect(getResponse.statusCode).toBe(200);

      const getMissingResponse = await app.inject({
        method: 'GET',
        url: '/api/mcp/notes/missing-note',
      });
      expect(getMissingResponse.statusCode).toBe(404);

      const searchInvalidResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/notes/search',
        payload: {},
      });
      expect(searchInvalidResponse.statusCode).toBe(400);

      const searchResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/notes/search',
        payload: { query: 'mcp-tag', search_content: false, limit: 5 },
      });
      expect(searchResponse.statusCode).toBe(200);
      expect(JSON.parse(searchResponse.body).notes[0].id).toBe(createdNoteId);

      const patchResponse = await app.inject({
        method: 'PATCH',
        url: `/api/mcp/notes/${createdNoteId}`,
        payload: { title: 'MCP Note Updated', content: 'Updated linked [[Other]] content' },
      });
      expect(patchResponse.statusCode).toBe(200);

      const patchMissingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/mcp/notes/missing-note',
        payload: { title: 'Missing' },
      });
      expect(patchMissingResponse.statusCode).toBe(404);

      const createLinkedResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/notes',
        payload: { title: 'Other', content: 'Other body' },
      });
      const linkedNoteId = JSON.parse(createLinkedResponse.body).note.id as string;

      const vaultIndexResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/vault/index',
      });
      expect(vaultIndexResponse.statusCode).toBe(200);
      expect(JSON.parse(vaultIndexResponse.body).total).toBeGreaterThanOrEqual(2);

      const vaultReadInvalidResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/vault/read',
        payload: {},
      });
      expect(vaultReadInvalidResponse.statusCode).toBe(400);

      const vaultReadResponse = await app.inject({
        method: 'POST',
        url: '/api/mcp/vault/read',
        payload: { ids: [createdNoteId, linkedNoteId], format: 'detail', include_links: true },
      });
      expect(vaultReadResponse.statusCode).toBe(200);
      expect(JSON.parse(vaultReadResponse.body).notes.length).toBe(2);

      const deleteMissingResponse = await app.inject({
        method: 'DELETE',
        url: '/api/mcp/notes/missing-note',
      });
      expect(deleteMissingResponse.statusCode).toBe(404);

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/mcp/notes/${createdNoteId}`,
      });
      expect(deleteResponse.statusCode).toBe(200);
    });
  });

  describe('Logs API', () => {
    it('log configuration endpoints should validate paths and list log files', async () => {
      const configResponse = await app.inject({
        method: 'GET',
        url: '/api/config/logs',
      });
      expect(configResponse.statusCode).toBe(200);

      const invalidLevelResponse = await app.inject({
        method: 'POST',
        url: '/api/config/logs',
        payload: { log_level: 'TRACE' },
      });
      expect(invalidLevelResponse.statusCode).toBe(400);

      const invalidDirResponse = await app.inject({
        method: 'POST',
        url: '/api/config/logs',
        payload: { log_dir: path.join(testDir, '..', 'outside-logs') },
      });
      expect(invalidDirResponse.statusCode).toBe(400);

      const targetLogDir = path.join(testDir, 'logs-route');
      const updateResponse = await app.inject({
        method: 'POST',
        url: '/api/config/logs',
        payload: {
          log_dir: targetLogDir,
          log_level: 'WARNING',
          max_log_files: 3,
          log_rotation: true,
        },
      });
      expect(updateResponse.statusCode).toBe(200);

      fs.mkdirSync(targetLogDir, { recursive: true });
      fs.writeFileSync(path.join(targetLogDir, 'b.log'), 'bbb');
      fs.writeFileSync(path.join(targetLogDir, 'a.log'), 'aaa');
      const oldTime = new Date('2098-01-01T00:00:00.000Z');
      const newTime = new Date('2099-01-01T00:00:00.000Z');
      fs.utimesSync(path.join(targetLogDir, 'a.log'), oldTime, oldTime);
      fs.utimesSync(path.join(targetLogDir, 'b.log'), newTime, newTime);

      const dirResponse = await app.inject({
        method: 'GET',
        url: '/api/config/logs/dir',
      });
      expect(dirResponse.statusCode).toBe(200);
      const dirBody = JSON.parse(dirResponse.body);
      expect(dirBody.files[0].name).toBe('b.log');

      const openDirResponse = await app.inject({
        method: 'POST',
        url: '/api/config/logs/open-dir',
      });
      expect(openDirResponse.statusCode).toBe(200);
      expect(JSON.parse(openDirResponse.body).path).toBe(targetLogDir);
    });
  });

  describe('AI Chat and Completion API', () => {
    it('POST /api/chat should validate message and provider state', async () => {
      const { aiConfig } = await import('../../src/api/routes/ai.js');

      const invalidMessageResponse = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {},
      });
      expect(invalidMessageResponse.statusCode).toBe(400);

      aiConfig.config.current_provider = 'missing-provider';
      const missingProviderResponse = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hello' },
      });
      expect(missingProviderResponse.statusCode).toBe(400);

      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-openai-no-key',
          type: 'openai',
          name: 'OpenAI No Key',
          baseUrl: 'https://api.openai.com/v1',
          enabled: true,
        },
      });
      aiConfig.config.current_provider = 'openai';

      const noKeyResponse = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hello' },
      });
      expect(noKeyResponse.statusCode).toBe(400);
    });

    it('POST /api/chat should stream content, reasoning and tool execution events', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-ollama-chat',
          type: 'ollama',
          name: 'Ollama Chat',
          baseUrl: 'http://localhost:11434',
          enabled: true,
          isDefault: true,
          models: [{ id: 'model-ollama-chat', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });

      const { aiConfig, aiManager } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';
      const session = aiManager.createSession('SSE Session', true);
      const originalChatStream = aiManager.chatStream.bind(aiManager);

      aiManager.chatStream = async function* () {
        yield {
          type: 'user_saved',
          data: {
            messageId: 'user-msg-1',
            sessionId: session.id,
            model: 'llama3',
            provider: 'ollama',
            attachments: [],
          },
        };
        yield { type: 'content', data: 'Hello' };
        yield { type: 'reasoning', data: 'Think' };
        yield {
          type: 'title_updated',
          data: {
            sessionId: session.id,
            title: 'Generated SSE Title',
          },
        };
        yield {
          type: 'tool_start',
          data: {
            id: 'tool-call-1',
            function: {
              name: 'get_card_stats',
              arguments: '{}',
            },
          },
        };
        yield {
          type: 'stream_end',
          data: {
            sessionId: session.id,
            parentMessageId: 'user-msg-1',
            model: 'llama3',
            provider: 'ollama',
          },
        };
      };

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/chat',
          payload: { message: 'hello from chat route', session_id: session.id },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('"type":"user_saved"');
        expect(response.body).toContain('"type":"text"');
        expect(response.body).toContain('"type":"reasoning"');
        expect(response.body).toContain('"type":"title_updated"');
        expect(response.body).toContain('"title":"Generated SSE Title"');
        expect(response.body).toContain('"type":"tool_call"');
        expect(response.body).toContain('"type":"tool_result"');
        expect(response.body).toContain('"type":"done"');
      } finally {
        aiManager.chatStream = originalChatStream;
      }
    });

    it('POST /api/messages/:messageId/regenerate should cover not-found and success streaming branches', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-ollama-regen',
          type: 'ollama',
          name: 'Ollama Regen',
          baseUrl: 'http://localhost:11434',
          enabled: true,
          isDefault: true,
          models: [{ id: 'model-ollama-regen', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });

      const { aiConfig, aiManager } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';
      const originalPrepareRegenerate = aiManager.prepareRegenerate.bind(aiManager);
      const originalRegenerateStream = aiManager.regenerateStream.bind(aiManager);

      const missingResponse = await app.inject({
        method: 'POST',
        url: '/api/messages/missing-message/regenerate',
        payload: {},
      });
      expect(missingResponse.statusCode).toBe(404);

      const session = aiManager.createSession('Regen Session', true);
      aiManager.prepareRegenerate = () => ({
        sessionId: session.id,
        userMessage: 'saved user message',
        userAttachments: [],
        parentMessageId: 'parent-msg-1',
      });
      aiManager.regenerateStream = async function* () {
        yield {
          type: 'user_saved',
          data: {
            messageId: 'user-msg-regen',
            sessionId: session.id,
            model: 'llama3',
            provider: 'ollama',
            attachments: [],
            regenerated: true,
          },
        };
        yield { type: 'content', data: 'Regenerated reply' };
        yield {
          type: 'stream_end',
          data: {
            sessionId: session.id,
            parentMessageId: 'parent-msg-1',
            model: 'llama3',
            provider: 'ollama',
          },
        };
      };

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/messages/assistant-msg-1/regenerate',
          payload: {},
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('"type":"user_saved"');
        expect(response.body).toContain('Regenerated reply');
        expect(response.body).toContain('"type":"done"');
      } finally {
        aiManager.prepareRegenerate = originalPrepareRegenerate;
        aiManager.regenerateStream = originalRegenerateStream;
      }
    });

    it('PATCH /api/messages/:messageId should update content or return 404', async () => {
      const { aiManager } = await import('../../src/api/routes/ai.js');
      const session = aiManager.createSession('Patch Session', true);
      const userRow = aiManager.persistUserMessage
        ? await aiManager.persistUserMessage(session.id, 'hello', [])
        : null;

      const assistantId = await aiManager.persistAssistantMessage({
        sessionId: session.id,
        content: 'original',
        blocks: [{ type: 'text', text: 'original' }],
        model: 'test-model',
        provider: 'ollama',
        parentMessageId: userRow,
      });

      const missingResponse = await app.inject({
        method: 'PATCH',
        url: '/api/messages/missing-patch-message',
        payload: { content: 'updated' },
      });
      expect(missingResponse.statusCode).toBe(404);

      const invalidResponse = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${assistantId}`,
        payload: {},
      });
      expect(invalidResponse.statusCode).toBe(400);

      const okResponse = await app.inject({
        method: 'PATCH',
        url: `/api/messages/${assistantId}`,
        payload: { content: 'patched content' },
      });
      expect(okResponse.statusCode).toBe(200);
      const okBody = JSON.parse(okResponse.body) as { success: boolean };
      expect(okBody.success).toBe(true);
      expect(aiManager.getMessage(assistantId)?.content).toBe('patched content');
    });

    it('POST /api/translate should stream translation without persisting chat history', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-ollama-translate',
          type: 'ollama',
          name: 'Ollama Translate',
          baseUrl: 'http://localhost:11434',
          enabled: true,
          isDefault: true,
          models: [{ id: 'model-ollama-translate', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });

      const { aiConfig, aiManager } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';
      const originalTranslateStream = aiManager.translateStream.bind(aiManager);

      const missingProviderResponse = await app.inject({
        method: 'POST',
        url: '/api/translate',
        payload: { text: '' },
      });
      expect(missingProviderResponse.statusCode).toBe(400);

      aiManager.translateStream = async function* () {
        yield { type: 'content', data: 'Translated text' };
      };

      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/translate',
          payload: { text: '你好' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('Translated text');
        expect(response.body).toContain('"type":"done"');
      } finally {
        aiManager.translateStream = originalTranslateStream;
      }
    });

    it('completion endpoints should cover config validation and streaming branches', async () => {
      const { aiConfig } = await import('../../src/api/routes/ai.js');

      const getConfigResponse = await app.inject({
        method: 'GET',
        url: '/api/completion/config',
      });
      expect(getConfigResponse.statusCode).toBe(200);

      const invalidEnabledResponse = await app.inject({
        method: 'POST',
        url: '/api/completion/config',
        payload: { enabled: 'yes' },
      });
      expect(invalidEnabledResponse.statusCode).toBe(400);

      const invalidKeyResponse = await app.inject({
        method: 'POST',
        url: '/api/completion/config',
        payload: { unknown_key: true },
      });
      expect(invalidKeyResponse.statusCode).toBe(400);

      const updateConfigResponse = await app.inject({
        method: 'POST',
        url: '/api/completion/config',
        payload: { enabled: false, max_tokens: 12 },
      });
      expect(updateConfigResponse.statusCode).toBe(200);

      aiConfig.config.current_provider = 'missing-provider';
      const missingProviderResponse = await app.inject({
        method: 'POST',
        url: '/api/completion',
        payload: { prefix: 'hello' },
      });
      expect(missingProviderResponse.statusCode).toBe(400);

      const { saveProvider, saveApiKey, saveModel } = await import('../../src/db/database.js');
      const privateProviderId = saveProvider({
        id: 'provider-openai-private',
        type: 'openai',
        name: 'OpenAI Private',
        baseUrl: 'http://127.0.0.1:9001',
        enabled: true,
        isDefault: false,
      });
      saveApiKey(privateProviderId, { id: 'key-openai-private', name: 'default', key: 'sk-private' });
      saveModel(privateProviderId, { id: 'model-openai-private', name: 'gpt-4', modelId: 'gpt-4', enabled: true });
      aiConfig.config.current_provider = 'openai';
      aiConfig.config.current_model = 'gpt-4';

      const privateOpenAiResponse = await app.inject({
        method: 'POST',
        url: '/api/completion',
        payload: { prefix: 'hello' },
      });
      expect(privateOpenAiResponse.statusCode).toBe(200);
      expect(privateOpenAiResponse.body).toContain('SSRF');

      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-custom-no-key-completion',
          type: 'custom',
          name: 'Custom Completion No Key',
          baseUrl: 'https://custom.example.com/v1',
          enabled: true,
          models: [{ id: 'model-custom-no-key', name: 'custom-mini', modelId: 'custom-mini', enabled: true }],
        },
      });
      aiConfig.config.current_provider = 'custom';
      aiConfig.config.current_model = 'custom-mini';

      const missingKeyResponse = await app.inject({
        method: 'POST',
        url: '/api/completion',
        payload: { prefix: 'hello' },
      });
      expect(missingKeyResponse.statusCode).toBe(200);
      expect(missingKeyResponse.body).toContain('AI API Key 未设置');

      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-ollama-public-completion',
          type: 'ollama',
          name: 'Ollama Public Completion',
          baseUrl: 'http://localhost:11434',
          enabled: true,
          models: [{ id: 'model-ollama-public', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';

      const savedFetch = global.fetch;
      try {
        const chunks = [
          Buffer.from(`${JSON.stringify({ message: { content: 'Hel' } })}\n`),
          Buffer.from(`${JSON.stringify({ message: { content: 'lo' } })}\n`),
        ];
        let readIndex = 0;
        global.fetch = () => Promise.resolve({
          ok: true,
          status: 200,
          body: {
            getReader: () => ({
              read: async () => {
                if (readIndex >= chunks.length) {
                  return { done: true, value: undefined };
                }
                const value = chunks[readIndex];
                readIndex += 1;
                return { done: false, value };
              },
            }),
          },
        } as unknown as Response);

        const successResponse = await app.inject({
          method: 'POST',
          url: '/api/completion',
          payload: { prefix: 'stream please', max_tokens: 6 },
        });

        expect(successResponse.statusCode).toBe(200);
        expect(successResponse.body).toContain('"text":"Hel"');
        expect(successResponse.body).toContain('"text":"lo"');
        expect(successResponse.body).toContain('"done":true');
      } finally {
        global.fetch = savedFetch;
      }

      const privateOllamaPutResponse = await app.inject({
        method: 'PUT',
        url: '/api/providers/provider-ollama-public-completion',
        payload: {
          type: 'ollama',
          name: 'Ollama Public Completion',
          baseUrl: 'http://192.168.1.10:11434',
          enabled: true,
          models: [{ id: 'model-ollama-public', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });

      expect(privateOllamaPutResponse.statusCode).toBe(400);
      const privateOllamaBody = JSON.parse(privateOllamaPutResponse.body) as { error?: string };
      expect(privateOllamaBody.error).toMatch(/localhost|SSRF|本地/);
    });

    it('POST /api/completion should end the SSE stream when upstream fetch throws', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/providers',
        payload: {
          id: 'provider-ollama-throw-completion',
          type: 'ollama',
          name: 'Ollama Throw Completion',
          baseUrl: 'http://localhost:11435',
          enabled: true,
          isDefault: true,
          models: [{ id: 'model-ollama-throw', name: 'llama3', modelId: 'llama3', enabled: true }],
        },
      });

      const { aiConfig } = await import('../../src/api/routes/ai.js');
      aiConfig.config.current_provider = 'ollama';
      aiConfig.config.current_model = 'llama3';
      const savedFetch = global.fetch;
      try {
        global.fetch = () => Promise.reject(new Error('network down'));

        const response = await app.inject({
          method: 'POST',
          url: '/api/completion',
          payload: { prefix: 'throw please' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain('"error":"network down"');
        expect(response.body).toContain('"done":true');
      } finally {
        global.fetch = savedFetch;
      }
    });
  });

  // 边界测试必须嵌套在主集成测试组中，共享临时 PAPYRUS_DATA_DIR 和数据库清理钩子。
  // 原因：放在顶层会在主组 afterAll 删除环境变量后写入真实用户数据库。
  // 未复制一套独立生命周期：复用同一个 Fastify 实例和 beforeEach 可避免端口、路由与状态分叉。
  describe('Review Edge Cases', () => {
    it('POST /api/review/:cardId/rate rejects grade 0', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/cards',
        payload: { q: 'Q', a: 'A' },
      });
      const card = JSON.parse(createRes.body).card as { id: string };
      const res = await app.inject({
        method: 'POST',
        url: `/api/review/${card.id}/rate`,
        payload: { grade: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('POST /api/review/:cardId/rate rejects non-existent card', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/review/nosuchcard/rate',
        payload: { grade: 3 },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('Search Edge Cases', () => {
    it('GET /api/search truncates limit to 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/search?query=test&limit=999' });
      const body = JSON.parse(res.body) as { limit: number };
      expect(body.limit).toBe(200);
    });

    it('GET /api/search returns empty when offset exceeds total', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/search?query=unlikelyxyzabc&offset=1000' });
      expect(JSON.parse(res.body).results).toEqual([]);
    });

    it('GET /api/search clamps negative offset to zero', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/cards',
        payload: { q: 'Negative offset card', a: 'Search body' },
      });

      const res = await app.inject({ method: 'GET', url: '/api/search?query=negative&offset=-10&limit=1' });
      const body = JSON.parse(res.body);
      expect(res.statusCode).toBe(200);
      expect(body.offset).toBe(0);
      expect(body.results[0]).toMatchObject({
        type: 'card',
        title: 'Negative offset card',
        matched_field: 'question',
      });
    });
  });
});
