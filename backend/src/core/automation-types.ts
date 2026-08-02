/**
 * 描述每小时自动化的本地时间锚点。
 * 原因：结构化字段比 Cron 更容易校验和本地化。
 * 未使用 RRULE：首版只覆盖小时、每日和每周三种明确频率。
 */
export interface HourlyAutomationSchedule {
  kind: 'hourly';
  intervalHours: number;
  minute: number;
}

/**
 * 描述每日自动化的本地执行时间。
 * 原因：小时和分钟分离后无需解析用户字符串。
 * 未存储完整日期：每日任务不应绑定创建日期。
 */
export interface DailyAutomationSchedule {
  kind: 'daily';
  hour: number;
  minute: number;
}

/**
 * 描述每周自动化的星期与本地执行时间。
 * 原因：允许多选星期可覆盖工作日和周末等常见组合。
 * 未使用位掩码：数组在 API 和前端表单中更清晰。
 */
export interface WeeklyAutomationSchedule {
  kind: 'weekly';
  daysOfWeek: number[];
  hour: number;
  minute: number;
}

export type AutomationSchedule =
  | HourlyAutomationSchedule
  | DailyAutomationSchedule
  | WeeklyAutomationSchedule;

export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'missed';
export type AutomationRunTrigger = 'manual' | 'scheduled' | 'missed';

/**
 * 描述一次自动化工具调用的可审核快照。
 * 原因：运行记录需要保留参数、结果和错误，而不依赖全局 ToolManager 内存状态。
 * 未复用 ToolCallRecord：后者是会话级可变状态且不会跨进程持久化。
 */
export interface AutomationToolCall {
  name: string;
  params: Record<string, unknown>;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * 描述持久化后的自动化配置。
 * 原因：前后端共用稳定的 JSON 形状可减少字段映射分叉。
 * 未暴露数据库布尔整数和 JSON 字符串：这些属于 SQLite 实现细节。
 */
export interface Automation {
  id: string;
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  timezone: string;
  enabled: boolean;
  allowedTools: string[];
  modelOverride: string | null;
  reasoningOverride: boolean | null;
  nextRunAt: number | null;
  lastRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * 描述自动化执行的审核记录。
 * 原因：输出、推理和工具调用必须与普通聊天历史隔离。
 * 未只保存最终文本：失败诊断和写操作审核需要完整元数据。
 */
export interface AutomationRun {
  id: string;
  automationId: string;
  trigger: AutomationRunTrigger;
  status: AutomationRunStatus;
  scheduledFor: number | null;
  output: string;
  reasoning: string;
  toolCalls: AutomationToolCall[];
  error: string | null;
  model: string;
  provider: string;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
}

/**
 * 描述创建自动化所需字段。
 * 原因：服务端生成 ID 和时间戳，避免信任客户端主键。
 * 未复用 Automation：持久化派生字段不能由调用方覆盖。
 */
export interface CreateAutomationInput {
  name: string;
  prompt: string;
  schedule: AutomationSchedule;
  timezone: string;
  enabled: boolean;
  allowedTools: string[];
  modelOverride: string | null;
  reasoningOverride: boolean | null;
}

export type UpdateAutomationInput = Partial<CreateAutomationInput>;

