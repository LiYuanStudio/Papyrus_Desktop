import type { FastifyInstance } from 'fastify';
import { PapyrusTools, AIResponseParser } from '../../ai/tools.js';
import { getToolManager } from '../../ai/tool-manager.js';
import { convertCallToResponse } from './ai-common.js';
import type { ToolConfigPayload, ParsePayload } from './ai-common.js';

const papyrusTools = new PapyrusTools();

export default async function aiToolsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/tools/catalog', async (_request, reply) => {
    reply.send({
      success: true,
      tools: papyrusTools.getCatalog(),
    });
  });

  fastify.get('/tools/config', async (_request, reply) => {
    const manager = getToolManager();
    const config = manager.getConfig();
    reply.send({
      success: true,
      config: {
        mode: config.mode,
        auto_execute_tools: config.auto_execute_tools,
      },
    });
  });

  fastify.post('/tools/config', async (request, reply) => {
    const payload = request.body as ToolConfigPayload;
    const manager = getToolManager();
    manager.setConfig({
      mode: payload.mode,
      auto_execute_tools: payload.auto_execute_tools,
    });
    reply.send({
      success: true,
      config: {
        mode: payload.mode,
        auto_execute_tools: payload.auto_execute_tools,
      },
    });
  });

  fastify.get('/tools/pending', async (_request, reply) => {
    const manager = getToolManager();
    const pending = manager.getPendingCalls();
    reply.send({
      success: true,
      calls: pending.map(convertCallToResponse),
      count: pending.length,
    });
  });

  fastify.post('/tools/approve/:callId', async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const manager = getToolManager();
    const call = manager.approveCall(callId);
    if (!call) {
      reply.status(404).send({ success: false, error: `工具调用不存在或状态不正确: ${callId}` });
      return;
    }
    manager.markExecuting(callId);
    try {
      const result = papyrusTools.executeTool(call.tool_name, call.params) as Record<string, unknown>;
      if (result && result.success === false) {
        const errorMsg = String(result.error || '工具执行失败');
        manager.failCall(callId, errorMsg);
        reply.send({
          success: false,
          call: convertCallToResponse(call),
          message: errorMsg,
        });
        return;
      }
      manager.completeCall(callId, result);
      reply.send({
        success: true,
        call: convertCallToResponse(call),
        result,
      });
    } catch (e) {
      manager.failCall(callId, e instanceof Error ? e.message : String(e));
      reply.send({
        success: false,
        call: convertCallToResponse(call),
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  fastify.post('/tools/reject/:callId', async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const payload = request.body as { reason?: string } | undefined;
    const manager = getToolManager();
    const call = manager.rejectCall(callId, payload?.reason);
    if (!call) {
      reply.status(404).send({ success: false, error: `工具调用不存在或状态不正确: ${callId}` });
      return;
    }
    reply.send({
      success: true,
      call: convertCallToResponse(call),
      message: `工具调用已拒绝: ${payload?.reason || '用户拒绝执行'}`,
    });
  });

  fastify.get('/tools/calls', async (request, reply) => {
    const query = request.query as { limit?: string; status?: string };
    const manager = getToolManager();
    const calls = manager.getAllCalls(
      query.limit ? parseInt(query.limit, 10) : 100,
      query.status || null,
    );
    reply.send({
      success: true,
      calls: calls.map(convertCallToResponse),
      count: calls.length,
    });
  });

  fastify.get('/tools/calls/:callId', async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const manager = getToolManager();
    const call = manager.getCall(callId);
    if (!call) {
      reply.status(404).send({ success: false, error: `工具调用不存在: ${callId}` });
      return;
    }
    reply.send({ success: true, call: convertCallToResponse(call) });
  });

  fastify.post('/tools/parse', async (request, reply) => {
    const payload = request.body as ParsePayload;
    const result = AIResponseParser.parseResponse(payload.response, payload.reasoning_content ?? null);
    reply.send({
      success: true,
      data: {
        content: result.content,
        reasoning: result.reasoning,
        tool_call: result.tool_call,
      },
    });
  });

  fastify.post('/tools/submit', async (request, reply) => {
    const payload = request.body as { tool_name: string; params: Record<string, unknown> };
    const manager = getToolManager();

    if (manager.shouldAutoExecute(payload.tool_name)) {
      const callId = manager.createPendingCall(payload.tool_name, payload.params);
      manager.approveCall(callId);
      manager.markExecuting(callId);
      try {
        const result = papyrusTools.executeTool(payload.tool_name, payload.params);
        manager.completeCall(callId, result as unknown as Record<string, unknown>);
        const call = manager.getCall(callId);
        reply.send({
          success: true,
          call: call ? convertCallToResponse(call) : null,
          result,
          message: '工具调用已自动执行',
        });
      } catch (e) {
        manager.failCall(callId, e instanceof Error ? e.message : String(e));
        const call = manager.getCall(callId);
        reply.send({
          success: false,
          call: call ? convertCallToResponse(call) : null,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      const callId = manager.createPendingCall(payload.tool_name, payload.params);
      const call = manager.getCall(callId);
      reply.send({
        success: true,
        call: call ? convertCallToResponse(call) : null,
        message: '工具调用已提交，等待审批',
      });
    }
  });

  fastify.delete('/tools/history', async (request, reply) => {
    const query = request.query as { keep_pending?: string };
    const manager = getToolManager();
    const keepPending = query.keep_pending !== 'false';
    const cleared = manager.clearHistory(keepPending);
    reply.send({
      success: true,
      cleared_count: cleared,
      message: `已清理 ${cleared} 条历史记录`,
    });
  });
}