import type { FastifyInstance } from 'fastify';
import { aiConfig } from '../../ai/config-instance.js';
import { loadAIConfigFromDb } from '../../ai/db-sync.js';
import { aiManager } from './ai-chat.js';

/**
 * 查找可继续使用的空白会话。
 * 原因：默认新会话可能使用时间戳作为标题，messageCount 才是判断尚未开始对话的稳定信号。
 * 未按标题匹配：标题可本地化、自动生成或被用户修改，字符串规则容易漏判并继续制造重复会话。
 */
function findReusableBlankSession() {
  return aiManager.listSessions().find((session) => session.messageCount === 0);
}

export default async function aiSessionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/sessions', async (_request, reply) => {
    reply.send({
      success: true,
      sessions: aiManager.listSessions(),
      activeSessionId: aiManager.getActiveSessionId(),
    });
  });

  fastify.post('/sessions', async (request, reply) => {
    const payload = (request.body ?? {}) as { title?: string };
    const requestedTitle = payload.title?.trim();
    const reusableSession = requestedTitle ? undefined : findReusableBlankSession();
    const session = reusableSession
      ? aiManager.switchSession(reusableSession.id)
      : aiManager.createSession(requestedTitle, true);
    reply.send({
      success: true,
      session,
      activeSessionId: session.id,
    });
  });

  fastify.delete('/sessions', async (_request, reply) => {
    const result = aiManager.clearAllSessions();
    reply.send({
      success: true,
      deletedCount: result.deletedCount,
      activeSessionId: result.activeSessionId,
    });
  });

  fastify.post('/sessions/:sessionId/switch', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      aiManager.switchSession(sessionId);
      reply.send({
        success: true,
        activeSessionId: sessionId,
      });
    } catch (e) {
      reply.status(400).send({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  fastify.patch('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const payload = (request.body ?? {}) as { title?: string };
    if (typeof payload.title !== 'string') {
      reply.status(400).send({ success: false, error: 'title 字段必须为字符串' });
      return;
    }
    try {
      const session = aiManager.renameSession(sessionId, payload.title);
      reply.send({ success: true, session });
    } catch (e) {
      reply.status(400).send({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  fastify.post('/sessions/:sessionId/generate-title', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = aiManager.getSession(sessionId);
    if (!session) {
      reply.status(404).send({ success: false, error: '会话不存在' });
      return;
    }
    const firstUserMessage = aiManager.listMessages(sessionId)
      .find((message) => message.role === 'user' && message.content.trim().length > 0);
    if (!firstUserMessage) {
      reply.status(400).send({ success: false, error: '会话没有可用于生成标题的用户消息' });
      return;
    }

    try {
      // 手动生成前同步设置页的最新模型配置，确保用户刚选择的标题模型立即生效。
      // 原因：AIManager 持有长生命周期配置实例，不能依赖服务重启刷新。
      // 未从请求体接受 provider/model：标题目标属于全局设置，避免绕过已保存的密钥与供应商策略。
      loadAIConfigFromDb(aiConfig);
      const generated = await aiManager.generateSessionTitle(sessionId, {
        force: true,
        timeoutMs: 30_000,
      });
      if (!generated) {
        reply.status(409).send({ success: false, error: '标题已在生成或会话标题刚刚发生变化' });
        return;
      }
      reply.send({ success: true, session: generated });
    } catch (error) {
      reply.status(502).send({
        success: false,
        error: error instanceof Error ? error.message : '标题生成失败',
      });
    }
  });

  fastify.delete('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const result = aiManager.deleteSession(sessionId);
      reply.send({
        success: true,
        activeSessionId: result.activeSessionId,
      });
    } catch (e) {
      reply.status(400).send({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  fastify.get('/sessions/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = aiManager.getSession(sessionId);
    if (!session) {
      reply.status(404).send({ success: false, error: '会话不存在' });
      return;
    }
    const messages = aiManager.listMessages(sessionId);
    reply.send({
      success: true,
      session,
      messages,
    });
  });
}
