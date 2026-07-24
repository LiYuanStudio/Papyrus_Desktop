import type { FastifyInstance } from 'fastify';
import type { ChatBlock } from '../../core/types.js';
import { aiManager } from './ai-chat.js';

export default async function aiMessagesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.delete('/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const ok = aiManager.deleteMessage(messageId);
    if (!ok) {
      reply.status(404).send({ success: false, error: '消息不存在' });
      return;
    }
    reply.send({ success: true });
  });

  fastify.patch('/messages/:messageId', async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const payload = request.body as { content?: string };

    if (!payload.content || typeof payload.content !== 'string') {
      reply.status(400).send({ success: false, error: 'content 必须为非空字符串' });
      return;
    }

    const ok = aiManager.updateMessage(messageId, { content: payload.content });
    if (!ok) {
      reply.status(404).send({ success: false, error: '消息不存在' });
      return;
    }
    reply.send({ success: true });
  });

  fastify.post('/messages', async (request, reply) => {
    const payload = request.body as {
      sessionId: string;
      role: 'user' | 'assistant';
      content: string;
      blocks?: Array<Record<string, unknown>>;
      model?: string;
      provider?: string;
      parentMessageId?: string | null;
    };

    if (!payload.sessionId || typeof payload.sessionId !== 'string') {
      reply.status(400).send({ success: false, error: 'sessionId 必须为字符串' });
      return;
    }
    if (!payload.role || (payload.role !== 'user' && payload.role !== 'assistant')) {
      reply.status(400).send({ success: false, error: 'role 必须为 user 或 assistant' });
      return;
    }
    if (!payload.content || typeof payload.content !== 'string') {
      reply.status(400).send({ success: false, error: 'content 必须为非空字符串' });
      return;
    }

    try {
      const messageId = await aiManager.persistAssistantMessage({
        sessionId: payload.sessionId,
        content: payload.content,
        blocks: (payload.blocks || []).map(b => ({
          type: b.type as 'text' | 'reasoning' | 'tool_call' | 'tool_result',
          text: typeof b.text === 'string' ? b.text : undefined,
          toolCallId: typeof b.toolCallId === 'string' ? b.toolCallId : undefined,
          toolName: typeof b.toolName === 'string' ? b.toolName : undefined,
          toolStatus: b.toolStatus as ChatBlock['toolStatus'],
          toolParams: (typeof b.toolParams === 'object' && b.toolParams !== null) ? (b.toolParams as Record<string, unknown>) : undefined,
          toolResult: b.toolResult,
          toolError: typeof b.toolError === 'string' ? b.toolError : undefined,
        })),
        model: payload.model || '',
        provider: payload.provider || '',
        parentMessageId: payload.parentMessageId ?? null,
      });
      reply.send({ success: true, messageId });
    } catch (e) {
      reply.status(500).send({ success: false, error: e instanceof Error ? e.message : '保存消息失败' });
    }
  });
}