import type { AIManager } from '../ai/provider.js';
import type { PapyrusLogger } from '../utils/logger.js';
import { AutomationAgentRunner } from './automation-agent-runner.js';
import {
  claimAutomationRun,
  createAutomationRun,
  enqueueScheduledAutomation,
  failStaleAutomationRuns,
  finishAutomationRun,
  getAutomation,
  getEarliestNextRunAt,
  getNextQueuedAutomationRun,
  hasActiveAutomationRun,
  listDueAutomations,
  markAutomationMissed,
} from './automations.js';
import type { Automation, AutomationRun } from './automation-types.js';

const MAX_TIMER_DELAY_MS = 60_000;

/**
 * 管理自动化计划唤醒与全局串行执行队列。
 * 原因：单 Worker 可避免多个 Agent 同时修改卡片、笔记或文件。
 * 未为每个自动化创建 timer：单一可重排计时器更易处理编辑、暂停和系统时钟变化。
 */
interface AutomationRunner {
  run(automation: Automation): ReturnType<AutomationAgentRunner['run']>;
}

/**
 * 调度器执行边界，只暴露运行单个自动化所需方法。
 * 原因：测试需要替换不可控的外部模型，同时继续使用真实队列和 SQLite。
 * 未注入整个仓储层：仓储正是调度器测试需要覆盖的生产实现。
 */
export class AutomationScheduler {
  private readonly runner: AutomationRunner;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private processing = false;
  private started = false;

  constructor(
    aiManager: Pick<AIManager, 'standaloneAgentTurn'>,
    private readonly logger?: PapyrusLogger,
    runner?: AutomationRunner,
  ) {
    this.runner = runner ?? new AutomationAgentRunner(aiManager);
  }

  /**
   * 启动调度器并把崩溃遗留状态安全终止。
   * 原因：已执行一半的写操作无法判断是否可重放。
   * 未自动重试遗留任务：重复写入比明确失败更危险。
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    const staleCount = failStaleAutomationRuns();
    if (staleCount > 0) this.logger?.warning(`自动化: 标记 ${staleCount} 个遗留运行为失败`);

    const now = Date.now() / 1000;
    for (const automation of listDueAutomations(now)) {
      markAutomationMissed(automation, now);
    }
    this.scheduleNextWake();
    void this.processQueue();
  }

  /**
   * 停止未来唤醒。
   * 原因：后端关闭时不能留下引用进程的计时器。
   * 未强制中断正在执行的 Provider 请求：优雅关闭由进程生命周期统一处理。
   */
  stop(): void {
    this.started = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * 通知调度器配置已变化并重排下一次唤醒。
   * 原因：创建、编辑、启停后旧 timeout 可能不再正确。
   * 未等待当前运行：配置变化只影响后续计划。
   */
  notifyScheduleChanged(): void {
    if (this.started) this.scheduleNextWake();
  }

  /**
   * 创建手动运行并立即唤醒串行 Worker。
   * 原因：API 应快速返回 202，而不是占用请求直到 AI 完成。
   * 未要求自动化启用：暂停计划后仍允许用户显式测试。
   */
  enqueueManual(automationId: string): AutomationRun | null {
    if (!getAutomation(automationId) || hasActiveAutomationRun(automationId)) return null;
    const run = createAutomationRun(automationId, 'manual', null);
    void this.processQueue();
    return run;
  }

  /**
   * 到点后原子推进计划并加入执行队列。
   * 原因：先推进再执行可确保失败不会形成密集重试。
   * 未在 setTimeout 回调中直接执行单个任务：统一队列保持全局串行。
   */
  private async wake(): Promise<void> {
    const now = Date.now() / 1000;
    for (const automation of listDueAutomations(now)) {
      enqueueScheduledAutomation(automation, now);
    }
    this.scheduleNextWake();
    await this.processQueue();
  }

  /**
   * 根据数据库最早计划设置有上限的 timeout。
   * 原因：一分钟上限让系统时钟或休眠恢复后能及时重新校准。
   * 未使用固定秒级轮询：空闲时无需高频查询 SQLite。
   */
  private scheduleNextWake(): void {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    const nextRunAt = getEarliestNextRunAt();
    const desiredDelay = nextRunAt === null
      ? MAX_TIMER_DELAY_MS
      : Math.max(50, (nextRunAt - Date.now() / 1000) * 1000);
    const delay = Math.min(MAX_TIMER_DELAY_MS, desiredDelay);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.wake().catch((error: unknown) => {
        this.logger?.error(`自动化调度失败: ${error instanceof Error ? error.message : String(error)}`);
        this.scheduleNextWake();
      });
    }, delay);
  }

  /**
   * 逐个认领排队任务并写入终态。
   * 原因：循环读取队首允许手动和计划任务共用 FIFO 队列。
   * 未并行 Promise.all：自动化可能调用有副作用的写工具。
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (true) {
        const queued = getNextQueuedAutomationRun();
        if (!queued) break;
        if (!claimAutomationRun(queued.id)) continue;
        const automation = getAutomation(queued.automationId);
        if (!automation) continue;
        try {
          const result = await this.runner.run(automation);
          finishAutomationRun({
            runId: queued.id,
            status: 'succeeded',
            output: result.output,
            reasoning: result.reasoning,
            toolCalls: result.toolCalls,
            error: null,
            model: result.model,
            provider: result.provider,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          finishAutomationRun({
            runId: queued.id,
            status: 'failed',
            output: '',
            reasoning: '',
            toolCalls: [],
            error: message,
            model: automation.modelOverride ?? '',
            provider: automation.providerOverride ?? '',
          });
          this.logger?.error(`自动化运行失败 (${automation.id}): ${message}`);
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

let scheduler: AutomationScheduler | null = null;

/**
 * 初始化全局调度器单例。
 * 原因：API、server 生命周期和测试必须引用同一个队列。
 * 未在模块加载时构造：AIManager 依赖完成后的配置实例。
 */
export function initializeAutomationScheduler(
  aiManager: AIManager,
  logger?: PapyrusLogger,
): AutomationScheduler {
  if (!scheduler) scheduler = new AutomationScheduler(aiManager, logger);
  return scheduler;
}

/**
 * 返回已初始化的全局调度器。
 * 原因：路由需要在不创建第二个 Worker 的情况下入队。
 * 未静默创建：缺少 AIManager 时自动构造会产生配置分叉。
 */
export function getAutomationScheduler(): AutomationScheduler {
  if (!scheduler) throw new Error('自动化调度器尚未初始化');
  return scheduler;
}
