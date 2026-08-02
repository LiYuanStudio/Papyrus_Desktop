import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TOOL_LIST, TOOL_REGISTRY } from '../../ai/tools.js';
import { getAutomationScheduler } from '../../core/automation-scheduler.js';
import {
  createAutomation,
  deleteAutomation,
  getAutomation,
  getAutomationRun,
  hasActiveAutomationRun,
  listAutomationRuns,
  listAutomations,
  listRecentAutomationRuns,
  updateAutomation,
} from '../../core/automations.js';

const HourlyScheduleSchema = z.object({
  kind: z.literal('hourly'),
  intervalHours: z.number().int().min(1).max(24),
  minute: z.number().int().min(0).max(59),
});

const DailyScheduleSchema = z.object({
  kind: z.literal('daily'),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const WeeklyScheduleSchema = z.object({
  kind: z.literal('weekly'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .transform((days) => [...new Set(days)].sort((left, right) => left - right)),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

const AutomationScheduleSchema = z.discriminatedUnion('kind', [
  HourlyScheduleSchema,
  DailyScheduleSchema,
  WeeklyScheduleSchema,
]);

const AutomationInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  prompt: z.string().trim().min(1).max(20_000),
  schedule: AutomationScheduleSchema,
  timezone: z.string().trim().min(1).max(100).optional(),
  enabled: z.boolean().default(true),
  allowedTools: z.array(z.string().min(1)).max(100).optional(),
  modelOverride: z.string().trim().max(200).nullable().optional(),
  reasoningOverride: z.boolean().nullable().optional(),
});

const AutomationPatchSchema = AutomationInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: '至少提供一个更新字段' },
);

/**
 * 返回当前后端系统时区。
 * 原因：首版计划只在本机执行，不允许客户端伪造其他时区语义。
 * 未硬编码 Asia/Shanghai：Papyrus 支持不同地区的桌面用户。
 */
function getSystemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * 校验工具白名单并返回去重后的稳定顺序。
 * 原因：API 必须在保存前拒绝未知工具，执行器还会再次校验。
 * 未相信前端目录：本地 API 仍可能被其他授权客户端调用。
 */
function normalizeAllowedTools(toolNames?: string[]): string[] {
  const source = toolNames ?? TOOL_LIST
    .filter((descriptor) => descriptor.sideEffect === 'read')
    .map((descriptor) => descriptor.name);
  const unique = [...new Set(source)];
  const unknown = unique.find((name) => TOOL_REGISTRY[name] === undefined);
  if (unknown) throw new Error(`未知工具: ${unknown}`);
  return unique;
}

/**
 * 注册自动化 CRUD、执行和审核记录路由。
 * 原因：独立前缀可保持调度领域与聊天、UI 设置职责分离。
 * 未合入 AI 路由：自动化同时拥有持久化、计划和运行历史，不只是一次模型请求。
 */
export default async function automationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    reply.send({ success: true, automations: listAutomations() });
  });

  fastify.get('/runs/recent', async (request, reply) => {
    const query = request.query as { limit?: string };
    const parsedLimit = Number.parseInt(query.limit ?? '100', 10);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;
    reply.send({ success: true, runs: listRecentAutomationRuns(limit) });
  });

  fastify.get('/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = getAutomationRun(runId);
    if (!run) {
      reply.status(404).send({ success: false, error: '自动化运行记录不存在' });
      return;
    }
    reply.send({ success: true, run });
  });

  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const automation = getAutomation(id);
    if (!automation) {
      reply.status(404).send({ success: false, error: '自动化不存在' });
      return;
    }
    reply.send({ success: true, automation });
  });

  fastify.get('/:id/runs', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getAutomation(id)) {
      reply.status(404).send({ success: false, error: '自动化不存在' });
      return;
    }
    const query = request.query as { limit?: string };
    const parsedLimit = Number.parseInt(query.limit ?? '100', 10);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;
    reply.send({ success: true, runs: listAutomationRuns(id, limit) });
  });

  fastify.post('/', async (request, reply) => {
    const parsed = AutomationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.issues[0]?.message ?? '自动化配置无效' });
      return;
    }
    try {
      const automation = createAutomation({
        ...parsed.data,
        timezone: getSystemTimezone(),
        allowedTools: normalizeAllowedTools(parsed.data.allowedTools),
        modelOverride: parsed.data.modelOverride || null,
        reasoningOverride: parsed.data.reasoningOverride ?? null,
      });
      getAutomationScheduler().notifyScheduleChanged();
      reply.status(201).send({ success: true, automation });
    } catch (error) {
      reply.status(400).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AutomationPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.issues[0]?.message ?? '自动化配置无效' });
      return;
    }
    try {
      const allowedTools = parsed.data.allowedTools === undefined
        ? undefined
        : normalizeAllowedTools(parsed.data.allowedTools);
      const automation = updateAutomation(id, {
        ...parsed.data,
        ...(allowedTools === undefined ? {} : { allowedTools }),
        ...(parsed.data.timezone === undefined ? {} : { timezone: getSystemTimezone() }),
        ...(parsed.data.modelOverride === '' ? { modelOverride: null } : {}),
      });
      if (!automation) {
        reply.status(404).send({ success: false, error: '自动化不存在' });
        return;
      }
      getAutomationScheduler().notifyScheduleChanged();
      reply.send({ success: true, automation });
    } catch (error) {
      reply.status(400).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (hasActiveAutomationRun(id)) {
      reply.status(409).send({ success: false, error: '自动化正在运行，暂时不能删除' });
      return;
    }
    if (!deleteAutomation(id)) {
      reply.status(404).send({ success: false, error: '自动化不存在' });
      return;
    }
    getAutomationScheduler().notifyScheduleChanged();
    reply.send({ success: true });
  });

  fastify.post('/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!getAutomation(id)) {
      reply.status(404).send({ success: false, error: '自动化不存在' });
      return;
    }
    const run = getAutomationScheduler().enqueueManual(id);
    if (!run) {
      reply.status(409).send({ success: false, error: '自动化已有排队或运行中的任务' });
      return;
    }
    reply.status(202).send({ success: true, run });
  });
}

