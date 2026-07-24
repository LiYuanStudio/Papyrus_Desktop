import { randomUUID } from 'node:crypto';

export type ToolCallStatus = 'pending' | 'approved' | 'rejected' | 'executing' | 'success' | 'failed';

export interface ToolCallConfig {
  mode: string;
  auto_execute_tools: string[];
}

export interface ToolCallRecord {
  call_id: string;
  tool_name: string;
  params: Record<string, unknown>;
  status: ToolCallStatus;
  result: Record<string, unknown> | null;
  created_at: number;
  executed_at: number | null;
  error: string | null;
}

export class ToolManager {
  private pendingCalls: Map<string, ToolCallRecord> = new Map();
  private allCalls: Map<string, ToolCallRecord> = new Map();
  private config: ToolCallConfig = {
    mode: 'manual',
    auto_execute_tools: [
      'search_cards',
      'get_card_stats',
      'search_notes',
      'get_note',
      'list_relations',
      'read_file',
      'list_files',
      'read_data_stats',
      'list_extensions',
      'get_settings',
    ],
  };

  getConfig(): ToolCallConfig {
    return { ...this.config, auto_execute_tools: [...this.config.auto_execute_tools] };
  }

  setConfig(newConfig: ToolCallConfig): void {
    this.config = {
      mode: newConfig.mode,
      auto_execute_tools: [...newConfig.auto_execute_tools],
    };
  }

  updateConfig(updates: Partial<ToolCallConfig>): void {
    if (updates.mode !== undefined) this.config.mode = updates.mode;
    if (updates.auto_execute_tools !== undefined) this.config.auto_execute_tools = [...updates.auto_execute_tools];
  }

  shouldAutoExecute(toolName: string): boolean {
    if (this.config.mode === 'auto') return true;
    return this.config.auto_execute_tools.includes(toolName);
  }

  createPendingCall(toolName: string, params: Record<string, unknown>): string {
    const callId = `tc_${randomUUID().replace(/-/g, '')}`;
    const record: ToolCallRecord = {
      call_id: callId,
      tool_name: toolName,
      params,
      status: 'pending',
      result: null,
      created_at: Date.now() / 1000,
      executed_at: null,
      error: null,
    };
    this.pendingCalls.set(callId, record);
    this.allCalls.set(callId, record);
    return callId;
  }

  getPendingCalls(): ToolCallRecord[] {
    return Array.from(this.pendingCalls.values())
      .filter(c => c.status === 'pending')
      .map(c => ({ ...c, params: { ...c.params } }));
  }

  getCall(callId: string): ToolCallRecord | null {
    const record = this.allCalls.get(callId);
    return record ? { ...record, params: { ...record.params } } : null;
  }

  approveCall(callId: string): ToolCallRecord | null {
    const record = this.pendingCalls.get(callId);
    if (!record || record.status !== 'pending') return null;
    record.status = 'approved';
    return { ...record, params: { ...record.params } };
  }

  rejectCall(callId: string, reason?: string): ToolCallRecord | null {
    const record = this.pendingCalls.get(callId);
    if (!record || record.status !== 'pending') return null;
    record.status = 'rejected';
    record.error = reason || '用户拒绝执行';
    this.pendingCalls.delete(callId);
    return { ...record, params: { ...record.params } };
  }

  markExecuting(callId: string): ToolCallRecord | null {
    const record = this.allCalls.get(callId);
    if (!record || record.status !== 'approved') return null;
    record.status = 'executing';
    return { ...record, params: { ...record.params } };
  }

  completeCall(callId: string, result: Record<string, unknown>): ToolCallRecord | null {
    let record = this.pendingCalls.get(callId);
    if (record) {
      if (record.status !== 'executing') return null;
      this.pendingCalls.delete(callId);
    } else {
      record = this.allCalls.get(callId);
      if (!record || record.status !== 'executing') return null;
    }
    record.status = 'success';
    record.result = result;
    record.executed_at = Date.now() / 1000;
    return { ...record, params: { ...record.params } };
  }

  failCall(callId: string, error: string): ToolCallRecord | null {
    let record = this.pendingCalls.get(callId);
    if (record) {
      if (record.status !== 'executing') return null;
      this.pendingCalls.delete(callId);
    } else {
      record = this.allCalls.get(callId);
      if (!record || record.status !== 'executing') return null;
    }
    record.status = 'failed';
    record.error = error;
    record.executed_at = Date.now() / 1000;
    return { ...record, params: { ...record.params } };
  }

  getAllCalls(limit = 100, status?: string | null): ToolCallRecord[] {
    let calls = Array.from(this.allCalls.values());
    if (status) {
      calls = calls.filter(c => c.status === status);
    }
    calls.sort((a, b) => b.created_at - a.created_at);
    return calls.slice(0, limit).map(c => ({ ...c, params: { ...c.params } }));
  }

  clearHistory(keepPending = true): number {
    if (keepPending) {
      const pendingIds = new Set(this.pendingCalls.keys());
      const cleared = this.allCalls.size - pendingIds.size;
      for (const [id] of this.allCalls) {
        if (!pendingIds.has(id)) {
          this.allCalls.delete(id);
        }
      }
      return cleared;
    }
    const cleared = this.allCalls.size;
    this.allCalls.clear();
    this.pendingCalls.clear();
    return cleared;
  }
}

let globalToolManager: ToolManager | null = null;

export function getToolManager(): ToolManager {
  if (!globalToolManager) {
    globalToolManager = new ToolManager();
  }
  return globalToolManager;
}

export function resetToolManager(): void {
  globalToolManager = new ToolManager();
}
