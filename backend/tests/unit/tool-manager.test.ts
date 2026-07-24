import { ToolManager, getToolManager } from '../../src/ai/tool-manager.js';

describe('ToolManager', () => {
  let manager: ToolManager;

  beforeEach(() => {
    manager = new ToolManager();
  });

  it('should create pending call', () => {
    const callId = manager.createPendingCall('search_cards', { keyword: 'test' });
    expect(callId.startsWith('tc_')).toBe(true);
    // After randomUUID migration, callId should be tc_ + uuid without dashes
    expect(callId.length).toBeGreaterThan(10);
    const pending = manager.getPendingCalls();
    expect(pending.length).toBe(1);
    expect(pending[0]?.tool_name).toBe('search_cards');
  });

  it('should approve and complete call', () => {
    const callId = manager.createPendingCall('create_card', { question: 'Q', answer: 'A' });
    const approved = manager.approveCall(callId);
    expect(approved?.status).toBe('approved');

    manager.markExecuting(callId);
    const completed = manager.completeCall(callId, { success: true });
    expect(completed?.status).toBe('success');
    expect(manager.getPendingCalls().length).toBe(0);
  });

  it('should reject call', () => {
    const callId = manager.createPendingCall('delete_card', { card_index: 0 });
    const rejected = manager.rejectCall(callId, '太危险');
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.error).toBe('太危险');
    expect(manager.getPendingCalls().length).toBe(0);
  });

  it('should auto execute readonly tools in manual mode', () => {
    expect(manager.shouldAutoExecute('search_cards')).toBe(true);
    expect(manager.shouldAutoExecute('get_card_stats')).toBe(true);
    expect(manager.shouldAutoExecute('create_card')).toBe(false);
  });

  it('should auto execute all tools in auto mode', () => {
    manager.setConfig({ mode: 'auto', auto_execute_tools: [] });
    expect(manager.shouldAutoExecute('delete_card')).toBe(true);
  });

  it('should get all calls with limit and status filter', () => {
    manager.createPendingCall('search_cards', { keyword: 'a' });
    manager.createPendingCall('search_cards', { keyword: 'b' });
    expect(manager.getAllCalls(1).length).toBe(1);
    expect(manager.getAllCalls(100, 'pending').length).toBe(2);
  });

  it('should clear history while keeping pending', () => {
    const callId = manager.createPendingCall('search_cards', { keyword: 'test' });
    manager.approveCall(callId);
    manager.markExecuting(callId);
    manager.completeCall(callId, { success: true });
    manager.createPendingCall('search_cards', { keyword: 'pending' });

    expect(manager.getAllCalls().length).toBe(2);
    const cleared = manager.clearHistory(true);
    expect(cleared).toBe(1);
    expect(manager.getAllCalls().length).toBe(1);
  });

  it('should return singleton from getToolManager', () => {
    const tm1 = getToolManager();
    const tm2 = getToolManager();
    expect(tm1).toBe(tm2);
  });

  it('should update config partially', () => {
    manager.updateConfig({ mode: 'auto' });
    expect(manager.getConfig().mode).toBe('auto');
    manager.updateConfig({ auto_execute_tools: ['x'] });
    expect(manager.getConfig().auto_execute_tools).toEqual(['x']);
  });

  it('should return null for approving non-existent call', () => {
    expect(manager.approveCall('no-such-id')).toBeNull();
  });

  it('should return null for rejecting non-pending call', () => {
    const callId = manager.createPendingCall('search_cards', {});
    manager.approveCall(callId);
    expect(manager.rejectCall(callId)).toBeNull();
  });

  it('should return null for markExecuting non-approved call', () => {
    const callId = manager.createPendingCall('search_cards', {});
    expect(manager.markExecuting(callId)).toBeNull();
  });

  it('should return null for complete/fail non-executing call', () => {
    const callId = manager.createPendingCall('search_cards', {});
    expect(manager.completeCall(callId, {})).toBeNull();
    expect(manager.failCall(callId, 'err')).toBeNull();
  });

  it('should clear all history including pending', () => {
    manager.createPendingCall('search_cards', { keyword: 'a' });
    const cleared = manager.clearHistory(false);
    expect(cleared).toBeGreaterThan(0);
    expect(manager.getAllCalls().length).toBe(0);
  });

  it('should get call by id', () => {
    const callId = manager.createPendingCall('search_cards', { keyword: 'a' });
    expect(manager.getCall(callId)).not.toBeNull();
    expect(manager.getCall('no-such-id')).toBeNull();
  });

  describe('edge cases', () => {
    it('setConfig stores empty auto_execute_tools', () => {
      manager.setConfig({ mode: 'manual', auto_execute_tools: [] });
      expect(manager.getConfig().auto_execute_tools).toEqual([]);
    });

    it('getAllCalls with limit=0 returns empty', () => {
      manager.createPendingCall('t1', {});
      expect(manager.getAllCalls(0).length).toBe(0);
    });

    it('getAllCalls filters by status', () => {
      const id = manager.createPendingCall('t1', {});
      manager.approveCall(id);
      expect(manager.getAllCalls(100, 'approved').length).toBe(1);
      expect(manager.getAllCalls(100, 'rejected').length).toBe(0);
    });

    it('clearHistory(false) removes pending calls', () => {
      manager.createPendingCall('t1', {});
      manager.clearHistory(false);
      expect(manager.getPendingCalls().length).toBe(0);
      expect(manager.getAllCalls().length).toBe(0);
    });
  });
});
