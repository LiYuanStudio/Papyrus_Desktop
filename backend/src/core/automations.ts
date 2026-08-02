import { randomUUID } from 'node:crypto';
import { getDb, runInTransaction } from '../db/database.js';
import { calculateNextRun } from './automation-schedule.js';
import type {
  Automation,
  AutomationRun,
  AutomationRunStatus,
  AutomationRunTrigger,
  AutomationSchedule,
  AutomationToolCall,
  CreateAutomationInput,
  UpdateAutomationInput,
} from './automation-types.js';

interface AutomationRow {
  id: string;
  name: string;
  prompt: string;
  schedule_json: string;
  timezone: string;
  enabled: number;
  allowed_tools: string;
  model_override: string | null;
  reasoning_override: number | null;
  next_run_at: number | null;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AutomationRunRow {
  id: string;
  automation_id: string;
  trigger: AutomationRunTrigger;
  status: AutomationRunStatus;
  scheduled_for: number | null;
  output: string;
  reasoning: string;
  tool_calls_json: string;
  error: string | null;
  model: string;
  provider: string;
  started_at: number | null;
  finished_at: number | null;
  created_at: number;
}

/**
 * 安全解析数据库中的 JSON 数组。
 * 原因：旧数据或手工修改不应让整个自动化页面无法加载。
 * 未直接 JSON.parse 后断言：运行时校验可隔离损坏字段。
 */
function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 将数据库行转换为公开自动化类型。
 * 原因：集中处理 snake_case、布尔整数和 JSON 字段可保持 API 一致。
 * 未把数据库行直接返回：会泄露存储实现并降低类型安全。
 */
function automationFromRow(row: AutomationRow): Automation {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    schedule: JSON.parse(row.schedule_json) as AutomationSchedule,
    timezone: row.timezone,
    enabled: row.enabled === 1,
    allowedTools: parseStringArray(row.allowed_tools),
    modelOverride: row.model_override,
    reasoningOverride: row.reasoning_override === null ? null : row.reasoning_override === 1,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 将工具调用 JSON 转为审核记录。
 * 原因：运行详情必须容忍历史记录中的未知字段。
 * 未复用字符串数组解析：工具调用是对象结构，需要独立守卫。
 */
function parseToolCalls(value: string): AutomationToolCall[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AutomationToolCall => {
      if (item === null || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.name === 'string'
        && candidate.params !== null
        && typeof candidate.params === 'object'
        && typeof candidate.success === 'boolean';
    });
  } catch {
    return [];
  }
}

/**
 * 将数据库行转换为公开运行类型。
 * 原因：运行记录需要稳定的 camelCase API。
 * 未内联在查询函数中：多个列表和详情接口必须共享同一转换规则。
 */
function runFromRow(row: AutomationRunRow): AutomationRun {
  return {
    id: row.id,
    automationId: row.automation_id,
    trigger: row.trigger,
    status: row.status,
    scheduledFor: row.scheduled_for,
    output: row.output,
    reasoning: row.reasoning,
    toolCalls: parseToolCalls(row.tool_calls_json),
    error: row.error,
    model: row.model,
    provider: row.provider,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

/**
 * 返回全部自动化，按最近更新排序。
 * 原因：管理页优先展示用户刚编辑的项目。
 * 未按下次运行排序：暂停项目没有下次时间，会造成列表跳动。
 */
export function listAutomations(): Automation[] {
  const rows = getDb().prepare('SELECT * FROM automations ORDER BY updated_at DESC').all() as unknown as AutomationRow[];
  return rows.map(automationFromRow);
}

/**
 * 按 ID 获取自动化。
 * 原因：API、调度器和执行器都需要同一来源的最新配置。
 * 未缓存配置：编辑后的权限必须立即生效。
 */
export function getAutomation(id: string): Automation | null {
  const row = getDb().prepare('SELECT * FROM automations WHERE id = ?').get(id) as AutomationRow | undefined;
  return row ? automationFromRow(row) : null;
}

/**
 * 创建自动化并计算首次执行时间。
 * 原因：nextRunAt 由服务端统一生成，避免客户端时钟漂移。
 * 未接受客户端 ID：随机 UUID 可防止覆盖现有记录。
 */
export function createAutomation(input: CreateAutomationInput): Automation {
  const now = Date.now() / 1000;
  const id = randomUUID();
  const nextRunAt = input.enabled ? calculateNextRun(input.schedule, now) : null;
  getDb().prepare(`
    INSERT INTO automations
      (id, name, prompt, schedule_json, timezone, enabled, allowed_tools,
       model_override, reasoning_override, next_run_at, last_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    input.name,
    input.prompt,
    JSON.stringify(input.schedule),
    input.timezone,
    input.enabled ? 1 : 0,
    JSON.stringify(input.allowedTools),
    input.modelOverride,
    input.reasoningOverride === null ? null : input.reasoningOverride ? 1 : 0,
    nextRunAt,
    now,
    now,
  );
  const created = getAutomation(id);
  if (!created) throw new Error('自动化创建后无法读取');
  return created;
}

/**
 * 更新自动化并在计划或启停变化时重算下次运行。
 * 原因：全量写入合并后的已知字段可避免动态 SQL 注入风险。
 * 未保留旧 nextRunAt：计划语义变化后旧时间不再可信。
 */
export function updateAutomation(id: string, patch: UpdateAutomationInput): Automation | null {
  const current = getAutomation(id);
  if (!current) return null;
  const merged: CreateAutomationInput = {
    name: patch.name ?? current.name,
    prompt: patch.prompt ?? current.prompt,
    schedule: patch.schedule ?? current.schedule,
    timezone: patch.timezone ?? current.timezone,
    enabled: patch.enabled ?? current.enabled,
    allowedTools: patch.allowedTools ?? current.allowedTools,
    modelOverride: patch.modelOverride === undefined ? current.modelOverride : patch.modelOverride,
    reasoningOverride: patch.reasoningOverride === undefined ? current.reasoningOverride : patch.reasoningOverride,
  };
  const now = Date.now() / 1000;
  const shouldRecalculate = patch.schedule !== undefined || patch.enabled !== undefined;
  const nextRunAt = merged.enabled
    ? shouldRecalculate ? calculateNextRun(merged.schedule, now) : current.nextRunAt
    : null;
  getDb().prepare(`
    UPDATE automations
    SET name = ?, prompt = ?, schedule_json = ?, timezone = ?, enabled = ?, allowed_tools = ?,
        model_override = ?, reasoning_override = ?, next_run_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    merged.name,
    merged.prompt,
    JSON.stringify(merged.schedule),
    merged.timezone,
    merged.enabled ? 1 : 0,
    JSON.stringify(merged.allowedTools),
    merged.modelOverride,
    merged.reasoningOverride === null ? null : merged.reasoningOverride ? 1 : 0,
    nextRunAt,
    now,
    id,
  );
  return getAutomation(id);
}

/**
 * 删除自动化及其级联运行记录。
 * 原因：运行记录没有脱离所属自动化的业务意义。
 * 未手工逐表删除：SQLite 外键级联可保证事务一致性。
 */
export function deleteAutomation(id: string): boolean {
  return getDb().prepare('DELETE FROM automations WHERE id = ?').run(id).changes > 0;
}

/**
 * 返回指定自动化的运行记录。
 * 原因：详情页按最近运行优先展示审核项。
 * 未无限返回：限制数量可控制大型历史的响应体。
 */
export function listAutomationRuns(automationId: string, limit = 100): AutomationRun[] {
  const rows = getDb().prepare(
    'SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(automationId, limit) as unknown as AutomationRunRow[];
  return rows.map(runFromRow);
}

/**
 * 返回所有自动化的最近运行记录。
 * 原因：运行记录标签需要形成统一审核队列。
 * 未在前端合并多次请求：单个有界查询更高效且排序稳定。
 */
export function listRecentAutomationRuns(limit = 100): AutomationRun[] {
  const rows = getDb().prepare(
    'SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as unknown as AutomationRunRow[];
  return rows.map(runFromRow);
}

/**
 * 按 ID 获取运行记录。
 * 原因：详情抽屉需要完整输出和工具调用。
 * 未按自动化过滤：主键全局唯一且路由会额外校验所属关系。
 */
export function getAutomationRun(id: string): AutomationRun | null {
  const row = getDb().prepare('SELECT * FROM automation_runs WHERE id = ?').get(id) as AutomationRunRow | undefined;
  return row ? runFromRow(row) : null;
}

/**
 * 判断自动化是否已有排队或运行中的任务。
 * 原因：同一自动化不能重入，否则写工具可能重复执行。
 * 未只依赖内存集合：数据库状态可覆盖服务重启和 API 并发。
 */
export function hasActiveAutomationRun(automationId: string): boolean {
  const row = getDb().prepare(
    "SELECT 1 AS found FROM automation_runs WHERE automation_id = ? AND status IN ('queued', 'running') LIMIT 1"
  ).get(automationId) as { found: number } | undefined;
  return row !== undefined;
}

/**
 * 新建排队、遗漏或计划运行记录。
 * 原因：触发来源必须在执行前持久化，便于崩溃恢复和审计。
 * 未接受输出字段：只有执行完成接口可以写结果。
 */
export function createAutomationRun(
  automationId: string,
  trigger: AutomationRunTrigger,
  scheduledFor: number | null,
  status: AutomationRunStatus = 'queued',
): AutomationRun {
  const id = randomUUID();
  const now = Date.now() / 1000;
  const terminal = status === 'missed' ? now : null;
  getDb().prepare(`
    INSERT INTO automation_runs
      (id, automation_id, trigger, status, scheduled_for, finished_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, automationId, trigger, status, scheduledFor, terminal, now);
  const run = getAutomationRun(id);
  if (!run) throw new Error('自动化运行记录创建后无法读取');
  return run;
}

/**
 * 原子认领排队运行。
 * 原因：计时器和手动触发可能同时唤醒执行循环。
 * 未先读后写：带状态条件的 UPDATE 可防止重复认领。
 */
export function claimAutomationRun(runId: string): boolean {
  const now = Date.now() / 1000;
  const result = getDb().prepare(
    "UPDATE automation_runs SET status = 'running', started_at = ? WHERE id = ? AND status = 'queued'"
  ).run(now, runId);
  if (result.changes > 0) {
    const run = getAutomationRun(runId);
    if (run) {
      getDb().prepare('UPDATE automations SET last_run_at = ?, updated_at = updated_at WHERE id = ?')
        .run(now, run.automationId);
    }
  }
  return result.changes > 0;
}

/**
 * 完成运行并持久化输出和审核元数据。
 * 原因：所有终态字段在一次更新中提交，避免部分结果。
 * 未保存原始 Provider 流：结构化摘要足以支撑当前审核界面。
 */
export function finishAutomationRun(input: {
  runId: string;
  status: 'succeeded' | 'failed';
  output: string;
  reasoning: string;
  toolCalls: AutomationToolCall[];
  error: string | null;
  model: string;
  provider: string;
}): boolean {
  const result = getDb().prepare(`
    UPDATE automation_runs
    SET status = ?, output = ?, reasoning = ?, tool_calls_json = ?, error = ?,
        model = ?, provider = ?, finished_at = ?
    WHERE id = ? AND status = 'running'
  `).run(
    input.status,
    input.output,
    input.reasoning,
    JSON.stringify(input.toolCalls),
    input.error,
    input.model,
    input.provider,
    Date.now() / 1000,
    input.runId,
  );
  return result.changes > 0;
}

/**
 * 返回所有已到期自动化。
 * 原因：调度器只扫描有明确 nextRunAt 的启用任务。
 * 未包含暂停任务：启停是服务端强制边界而非 UI 提示。
 */
export function listDueAutomations(now: number): Automation[] {
  const rows = getDb().prepare(
    'SELECT * FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC'
  ).all(now) as unknown as AutomationRow[];
  return rows.map(automationFromRow);
}

/**
 * 推进计划并创建对应运行记录。
 * 原因：nextRunAt 与运行入队必须在同一事务中更新，防止重复触发。
 * 未在执行成功后推进：失败任务也不应在短时间内无限重试。
 */
export function enqueueScheduledAutomation(automation: Automation, now: number): AutomationRun | null {
  if (automation.nextRunAt === null) return null;
  return runInTransaction(() => {
    const nextRunAt = calculateNextRun(automation.schedule, now);
    const result = getDb().prepare(`
      UPDATE automations SET next_run_at = ?
      WHERE id = ? AND enabled = 1 AND next_run_at = ?
    `).run(nextRunAt, automation.id, automation.nextRunAt);
    if (result.changes === 0 || hasActiveAutomationRun(automation.id)) return null;
    return createAutomationRun(automation.id, 'scheduled', automation.nextRunAt);
  });
}

/**
 * 在启动恢复时记录一次遗漏并推进到未来计划。
 * 原因：用户选择跳过离线运行，且每个自动化只保留一次本次恢复证据。
 * 未补跑历史次数：无人值守写操作集中执行风险过高。
 */
export function markAutomationMissed(automation: Automation, now: number): AutomationRun | null {
  if (automation.nextRunAt === null || automation.nextRunAt > now) return null;
  return runInTransaction(() => {
    const nextRunAt = calculateNextRun(automation.schedule, now);
    const result = getDb().prepare(`
      UPDATE automations SET next_run_at = ?
      WHERE id = ? AND enabled = 1 AND next_run_at = ?
    `).run(nextRunAt, automation.id, automation.nextRunAt);
    if (result.changes === 0) return null;
    return createAutomationRun(automation.id, 'missed', automation.nextRunAt, 'missed');
  });
}

/**
 * 返回最早的下次运行时间。
 * 原因：单一计时器可避免每个任务持有独立 timeout。
 * 未使用固定高频轮询：按最近时间唤醒能降低空闲开销。
 */
export function getEarliestNextRunAt(): number | null {
  const row = getDb().prepare(
    'SELECT MIN(next_run_at) AS next_run_at FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL'
  ).get() as { next_run_at: number | null };
  return row.next_run_at;
}

/**
 * 返回最早排队运行。
 * 原因：全局串行 Worker 需要稳定的 FIFO 顺序。
 * 未一次加载全部：每次完成后再认领可及时响应暂停和删除。
 */
export function getNextQueuedAutomationRun(): AutomationRun | null {
  const row = getDb().prepare(
    "SELECT * FROM automation_runs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
  ).get() as AutomationRunRow | undefined;
  return row ? runFromRow(row) : null;
}

/**
 * 将进程崩溃遗留的运行状态转为失败。
 * 原因：重启后无法安全恢复已进行到一半的 Agent 写操作。
 * 未重新排队：重复执行可能再次修改用户数据。
 */
export function failStaleAutomationRuns(): number {
  const result = getDb().prepare(`
    UPDATE automation_runs
    SET status = 'failed', error = 'Papyrus 在运行期间退出，任务未自动重试', finished_at = ?
    WHERE status IN ('queued', 'running')
  `).run(Date.now() / 1000);
  return Number(result.changes);
}

