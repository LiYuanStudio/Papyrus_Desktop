import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Chat History DB Repo', () => {
  const testDir = path.join(os.tmpdir(), `papyrus-chat-history-test-${Date.now()}`);
  let dbPath: string;

  type DbModule = typeof import('../../src/db/database.js');
  let dbModule: DbModule;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.PAPYRUS_DATA_DIR = testDir;
    dbModule = await import('../../src/db/database.js');
    dbPath = path.join(testDir, 'papyrus.db');
  });

  afterAll(() => {
    dbModule.closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.PAPYRUS_DATA_DIR;
  });

  beforeEach(() => {
    dbModule.closeDb();
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath);
    }
    dbModule.getDb();
  });

  // ==================== Sessions ====================

  describe('Sessions', () => {
    it('should create and retrieve a session', () => {
      const created = dbModule.createChatSession({ id: 's1', title: '测试会话' });
      expect(created.id).toBe('s1');
      expect(created.title).toBe('测试会话');
      expect(created.is_active).toBe(0);
      expect(created.message_count).toBe(0);

      const fetched = dbModule.getChatSession('s1');
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('测试会话');
    });

    it('should list sessions ordered by updated_at DESC', () => {
      dbModule.createChatSession({ id: 's1', title: 'a', updated_at: 100 });
      dbModule.createChatSession({ id: 's2', title: 'b', updated_at: 200 });
      dbModule.createChatSession({ id: 's3', title: 'c', updated_at: 50 });
      const list = dbModule.listChatSessions();
      expect(list.map((s) => s.id)).toEqual(['s2', 's1', 's3']);
    });

    it('should rename a session via updateChatSession', () => {
      dbModule.createChatSession({ id: 's1', title: 'old' });
      const ok = dbModule.updateChatSession('s1', { title: 'new' });
      expect(ok).toBe(true);
      expect(dbModule.getChatSession('s1')?.title).toBe('new');
    });

    it('should return false when updating nonexistent session', () => {
      expect(dbModule.updateChatSession('nope', { title: 'x' })).toBe(false);
    });

    it('should compare-and-swap session metadata and title atomically', () => {
      const originalMetadata = JSON.stringify({ title_source: 'system' });
      const claimedMetadata = JSON.stringify({
        title_source: 'system',
        title_generation_id: 'generation-1',
      });
      dbModule.createChatSession({
        id: 's1',
        title: 'New conversation',
        metadata: originalMetadata,
      });

      expect(
        dbModule.compareAndSwapChatSessionMetadata(
          's1',
          originalMetadata,
          claimedMetadata,
        ),
      ).toBe(true);
      expect(
        dbModule.compareAndSwapChatSessionTitle(
          's1',
          originalMetadata,
          'Stale AI title',
          JSON.stringify({ title_source: 'ai' }),
        ),
      ).toBe(false);
      expect(
        dbModule.compareAndSwapChatSessionTitle(
          's1',
          claimedMetadata,
          'Generated title',
          JSON.stringify({ title_source: 'ai' }),
        ),
      ).toBe(true);

      const updated = dbModule.getChatSession('s1');
      expect(updated?.title).toBe('Generated title');
      expect(JSON.parse(updated?.metadata ?? '{}')).toEqual({ title_source: 'ai' });
    });

    it('should ensure setActiveChatSession leaves only one active row', () => {
      dbModule.createChatSession({ id: 's1' });
      dbModule.createChatSession({ id: 's2' });
      dbModule.createChatSession({ id: 's3' });
      dbModule.setActiveChatSession('s1');
      dbModule.setActiveChatSession('s2');
      dbModule.setActiveChatSession('s3');

      const all = dbModule.listChatSessions();
      const active = all.filter((s) => s.is_active === 1);
      expect(active.length).toBe(1);
      expect(active[0]?.id).toBe('s3');
      expect(dbModule.getActiveChatSession()?.id).toBe('s3');
    });

    it('should keep session order and updated_at stable when switching the active session', () => {
      dbModule.createChatSession({ id: 's1', updated_at: 100 });
      dbModule.createChatSession({ id: 's2', updated_at: 200 });
      dbModule.createChatSession({ id: 's3', updated_at: 50 });

      expect(dbModule.setActiveChatSession('s3')).toBe(true);

      const list = dbModule.listChatSessions();
      expect(list.map((session) => session.id)).toEqual(['s2', 's1', 's3']);
      expect(dbModule.getChatSession('s3')?.updated_at).toBe(50);
      expect(dbModule.getActiveChatSession()?.id).toBe('s3');
    });

    it('setActiveChatSession returns false for unknown id', () => {
      expect(dbModule.setActiveChatSession('ghost')).toBe(false);
    });

    it('should delete the active session and promote the most recent remaining one', () => {
      dbModule.createChatSession({ id: 's1', updated_at: 100 });
      dbModule.createChatSession({ id: 's2', updated_at: 200 });
      dbModule.setActiveChatSession('s1');
      const result = dbModule.deleteChatSession('s1');
      expect(result.deleted).toBe(true);
      expect(result.newActiveId).toBe('s2');
      expect(dbModule.getChatSession('s1')).toBeNull();
      expect(dbModule.getActiveChatSession()?.id).toBe('s2');
      expect(dbModule.getChatSession('s2')?.updated_at).toBe(200);
    });

    it('should allow deleting the very last session without throwing', () => {
      dbModule.createChatSession({ id: 'only' });
      dbModule.setActiveChatSession('only');
      const result = dbModule.deleteChatSession('only');
      expect(result.deleted).toBe(true);
      expect(result.newActiveId).toBeNull();
      expect(dbModule.listChatSessions().length).toBe(0);
    });

    it('should clear all sessions', () => {
      dbModule.createChatSession({ id: 's1' });
      dbModule.createChatSession({ id: 's2' });
      dbModule.appendChatMessage({ session_id: 's1', role: 'user', content: 'hi' });
      const removed = dbModule.clearAllChatSessions();
      expect(removed).toBe(2);
      expect(dbModule.listChatSessions().length).toBe(0);
      expect(dbModule.listChatMessages('s1').length).toBe(0);
    });
  });

  // ==================== Messages ====================

  describe('Messages', () => {
    beforeEach(() => {
      dbModule.createChatSession({ id: 'session-A', title: 'A' });
    });

    it('should append messages and bump message_count and updated_at', () => {
      const before = dbModule.getChatSession('session-A');
      const beforeUpdated = before?.updated_at ?? 0;
      const msg = dbModule.appendChatMessage({
        session_id: 'session-A',
        role: 'user',
        content: 'hello',
        blocks: JSON.stringify([{ type: 'text', text: 'hello' }]),
      });
      expect(msg.id).toBeDefined();
      const after = dbModule.getChatSession('session-A');
      expect(after?.message_count).toBe(1);
      expect((after?.updated_at ?? 0)).toBeGreaterThanOrEqual(beforeUpdated);
    });

    it('should preserve blocks JSON round-trip', () => {
      const blocks = [
        { type: 'reasoning', text: '思考一下' },
        { type: 'text', text: '答案是 42' },
        { type: 'tool_call', toolCallId: 'c1', toolName: 'sum', toolStatus: 'success' },
        { type: 'tool_result', toolCallId: 'c1', toolResult: { sum: 42 } },
      ];
      dbModule.appendChatMessage({
        session_id: 'session-A',
        role: 'assistant',
        content: '答案是 42',
        blocks: JSON.stringify(blocks),
      });
      const list = dbModule.listChatMessages('session-A');
      expect(list.length).toBe(1);
      const parsed = JSON.parse(list[0]!.blocks);
      expect(parsed).toEqual(blocks);
    });

    it('should reject append for nonexistent session', () => {
      expect(() =>
        dbModule.appendChatMessage({ session_id: 'ghost', role: 'user', content: 'x' }),
      ).toThrow();
    });

    it('should soft-delete a message and exclude from default list', () => {
      const m = dbModule.appendChatMessage({
        session_id: 'session-A',
        role: 'user',
        content: 'a',
      });
      expect(dbModule.softDeleteChatMessage(m.id)).toBe(true);
      expect(dbModule.listChatMessages('session-A').length).toBe(0);
      expect(dbModule.listChatMessages('session-A', { includeDeleted: true }).length).toBe(1);
    });

    it('should cascade delete messages when session is deleted', () => {
      dbModule.appendChatMessage({ session_id: 'session-A', role: 'user', content: 'q' });
      dbModule.appendChatMessage({ session_id: 'session-A', role: 'assistant', content: 'a' });
      dbModule.deleteChatSession('session-A');
      expect(dbModule.listChatMessages('session-A', { includeDeleted: true }).length).toBe(0);
    });

    it('updateChatMessage should patch blocks/content/model', () => {
      const m = dbModule.appendChatMessage({
        session_id: 'session-A',
        role: 'assistant',
        content: 'old',
        blocks: '[]',
      });
      const ok = dbModule.updateChatMessage(m.id, {
        content: 'new',
        blocks: JSON.stringify([{ type: 'text', text: 'new' }]),
        model: 'gpt-x',
      });
      expect(ok).toBe(true);
      const fetched = dbModule.getChatMessage(m.id);
      expect(fetched?.content).toBe('new');
      expect(fetched?.model).toBe('gpt-x');
    });

    it('deleteMessagesAfter should remove messages with created_at >= boundary and recount', () => {
      dbModule.appendChatMessage({ session_id: 'session-A', role: 'user', content: '1', created_at: 1 });
      dbModule.appendChatMessage({ session_id: 'session-A', role: 'assistant', content: '2', created_at: 2 });
      dbModule.appendChatMessage({ session_id: 'session-A', role: 'user', content: '3', created_at: 3 });
      const removed = dbModule.deleteMessagesAfter('session-A', 2);
      expect(removed).toBe(2);
      const remaining = dbModule.listChatMessages('session-A');
      expect(remaining.length).toBe(1);
      expect(dbModule.getChatSession('session-A')?.message_count).toBe(1);
    });

    it('getChatMessageCount should respect includeDeleted', () => {
      const m = dbModule.appendChatMessage({
        session_id: 'session-A',
        role: 'user',
        content: 'x',
      });
      dbModule.softDeleteChatMessage(m.id);
      expect(dbModule.getChatMessageCount('session-A')).toBe(0);
      expect(dbModule.getChatMessageCount('session-A', { includeDeleted: true })).toBe(1);
    });
  });
});
