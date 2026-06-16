import type { FastifyInstance } from 'fastify';
import { AIManager } from '../../ai/provider.js';
import type { StreamChunk } from '../../ai/provider.js';
import { PapyrusTools } from '../../ai/tools.js';
import { aiConfig } from '../../ai/config-instance.js';
import { getToolManager } from '../../ai/tool-manager.js';
import { getProviderApiKeyFromDB, getProviderConfigFromDB, loadAIConfigFromDb } from '../../ai/db-sync.js';
import type { ChatBlock } from '../../core/types.js';
import { isKeylessProvider } from './ai-common.js';
import type { PendingToolCallTracker, ChatStreamReply } from './ai-common.js';

export const aiManager = new AIManager(aiConfig);
const papyrusTools = new PapyrusTools();

async function processChatStream(
  stream: AsyncGenerator<StreamChunk>,
  reply: ChatStreamReply,
): Promise<void> {
  let textBuf = '';
  let reasoningBuf = '';
  let savedSessionId: string | null = null;
  let savedParentMessageId: string | null = null;
  let savedModel = '';
  let savedProvider = '';
  let userMessageId: string | null = null;
  let streamErrored = false;
  const pendingToolCalls: PendingToolCallTracker[] = [];

  try {
    for await (const chunk of stream) {
      if (chunk.type === 'user_saved') {
        const data = chunk.data as Record<string, unknown>;
        userMessageId = typeof data.messageId === 'string' ? data.messageId : null;
        savedSessionId = typeof data.sessionId === 'string' ? data.sessionId : null;
        savedModel = typeof data.model === 'string' ? data.model : '';
        savedProvider = typeof data.provider === 'string' ? data.provider : '';
        reply.raw.write(`data: ${JSON.stringify({
          type: 'user_saved',
          data: {
            messageId: userMessageId,
            sessionId: savedSessionId,
            attachments: Array.isArray(data.attachments) ? data.attachments : [],
            regenerated: data.regenerated === true,
          },
        })}\n\n`);
      } else if (chunk.type === 'content') {
        const text = typeof chunk.data === 'string' ? chunk.data : '';
        textBuf += text;
        reply.raw.write(`data: ${JSON.stringify({ type: 'text', data: text })}\n\n`);
      } else if (chunk.type === 'reasoning') {
        const text = typeof chunk.data === 'string' ? chunk.data : '';
        reasoningBuf += text;
        reply.raw.write(`data: ${JSON.stringify({ type: 'reasoning', data: text })}\n\n`);
      } else if (chunk.type === 'tool_start') {
        const toolData = chunk.data as Record<string, unknown>;
        const func = toolData.function as Record<string, unknown> | undefined;
        let callId: string | undefined;
        let toolName = '';
        let parsedArgs: Record<string, unknown> = {};
        let argStr = '';
        if (func) {
          toolName = String(func.name ?? '');
          argStr = String(func.arguments ?? '');
          if (argStr.trim()) {
            try {
              const parsed = JSON.parse(argStr) as unknown;
              if (parsed !== null && typeof parsed === 'object') {
                parsedArgs = parsed as Record<string, unknown>;
              }
            } catch {
              // JSON parse error: params stays empty
            }
          }
          const toolManager = getToolManager();
          if (toolManager.shouldAutoExecute(toolName)) {
            callId = toolManager.createPendingCall(toolName, parsedArgs);
            toolManager.approveCall(callId);
            toolManager.markExecuting(callId);
          } else {
            callId = toolManager.createPendingCall(toolName, parsedArgs);
          }
          pendingToolCalls.push({
            name: toolName,
            args: argStr,
            parsedArgs,
            id: String(toolData.id ?? ''),
            callId,
          });
        }
        const enrichedData = callId ? { ...toolData, callId } : toolData;
        reply.raw.write(`data: ${JSON.stringify({ type: 'tool_call', data: enrichedData })}\n\n`);
      } else if (chunk.type === 'stream_end') {
        const data = chunk.data as Record<string, unknown>;
        savedParentMessageId = typeof data.parentMessageId === 'string' ? data.parentMessageId : null;
        if (typeof data.model === 'string' && data.model) savedModel = data.model;
        if (typeof data.provider === 'string' && data.provider) savedProvider = data.provider;
        if (typeof data.sessionId === 'string' && data.sessionId) savedSessionId = data.sessionId;
      } else if (chunk.type === 'error') {
        streamErrored = true;
        const text = typeof chunk.data === 'string' ? chunk.data : 'Unknown error';
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', data: text })}\n\n`);
      }
    }

    const assistantBlocks: ChatBlock[] = [];
    if (reasoningBuf) assistantBlocks.push({ type: 'reasoning', text: reasoningBuf });
    if (textBuf) assistantBlocks.push({ type: 'text', text: textBuf });

    for (const toolCall of pendingToolCalls) {
      const toolManager = getToolManager();
      if (toolManager.shouldAutoExecute(toolCall.name) && toolCall.args) {
        try {
          const result = papyrusTools.executeTool(toolCall.name, toolCall.parsedArgs);
          if (toolCall.callId) {
            toolManager.completeCall(toolCall.callId, result as unknown as Record<string, unknown>);
          }
          reply.raw.write(`data: ${JSON.stringify({
            type: 'tool_result',
            data: {
              name: toolCall.name,
              success: true,
              result,
              callId: toolCall.callId,
            },
          })}\n\n`);
          assistantBlocks.push({
            type: 'tool_call',
            toolCallId: toolCall.callId,
            toolName: toolCall.name,
            toolParams: toolCall.parsedArgs,
            toolStatus: 'success',
          });
          assistantBlocks.push({
            type: 'tool_result',
            toolCallId: toolCall.callId,
            toolName: toolCall.name,
            toolStatus: 'success',
            toolResult: result,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (toolCall.callId) {
            toolManager.failCall(toolCall.callId, errMsg);
          }
          reply.raw.write(`data: ${JSON.stringify({
            type: 'tool_result',
            data: {
              name: toolCall.name,
              success: false,
              error: errMsg,
              callId: toolCall.callId,
            },
          })}\n\n`);
          assistantBlocks.push({
            type: 'tool_call',
            toolCallId: toolCall.callId,
            toolName: toolCall.name,
            toolParams: toolCall.parsedArgs,
            toolStatus: 'failed',
          });
          assistantBlocks.push({
            type: 'tool_result',
            toolCallId: toolCall.callId,
            toolName: toolCall.name,
            toolStatus: 'failed',
            toolError: errMsg,
          });
        }
      } else {
        assistantBlocks.push({
          type: 'tool_call',
          toolCallId: toolCall.callId,
          toolName: toolCall.name,
          toolParams: toolCall.parsedArgs,
          toolStatus: 'pending',
        });
      }
    }

    let assistantMessageId: string | null = null;
    const hasContent = textBuf.length > 0 || reasoningBuf.length > 0 || pendingToolCalls.length > 0;
    if (savedSessionId && hasContent && (!streamErrored || pendingToolCalls.length === 0)) {
      try {
        assistantMessageId = await aiManager.persistAssistantMessage({
          sessionId: savedSessionId,
          content: textBuf,
          blocks: assistantBlocks,
          model: savedModel,
          provider: savedProvider,
          parentMessageId: savedParentMessageId ?? userMessageId,
        });
      } catch (e) {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'error',
          data: `保存助手消息失败: ${e instanceof Error ? e.message : String(e)}`,
        })}\n\n`);
      }
    }

    reply.raw.write(`data: ${JSON.stringify({
      type: 'done',
      data: {
        messageId: assistantMessageId,
        sessionId: savedSessionId,
        parentMessageId: savedParentMessageId ?? userMessageId,
      },
    })}\n\n`);
  } catch (e) {
    reply.raw.write(`data: ${JSON.stringify({
      type: 'error',
      data: e instanceof Error ? e.message : String(e),
    })}\n\n`);
  } finally {
    reply.raw.end();
  }
}

export default async function aiChatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/chat', async (request, reply) => {
    // 在处理请求前，同步最新的配置
    loadAIConfigFromDb(aiConfig);
    
    const payload = request.body as {
      message: string;
      session_id?: string;
      system_prompt?: string;
      attachments?: Array<{ path?: string } | string>;
      model?: string;
      mode?: string;
      reasoning?: boolean | string;
    };

    if (!payload.message || typeof payload.message !== 'string') {
      reply.status(400).send({ success: false, error: 'message 字段必须为非空字符串' });
      return;
    }

    const providerName = aiConfig.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      reply.status(400).send({ success: false, error: 'Provider 未配置' });
      return;
    }

    if (!providerConfig.api_key) {
      const dbKey = getProviderApiKeyFromDB(providerName);
      if (dbKey) providerConfig.api_key = dbKey;
    }

    if (!providerConfig.api_key && !isKeylessProvider(providerName)) {
      reply.status(400).send({ success: false, error: 'AI API Key 未设置' });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const stream = aiManager.chatStream(
      payload.message,
      payload.system_prompt,
      payload.attachments,
      payload.model,
      payload.mode,
      payload.reasoning,
      payload.session_id,
    );
    await processChatStream(stream, reply);
  });

  fastify.post('/messages/:messageId/regenerate', async (request, reply) => {
  // 在处理请求前，同步最新的配置
    loadAIConfigFromDb(aiConfig);

  const { messageId } = request.params as { messageId: string };
    const payload = (request.body ?? {}) as {
      model?: string;
      mode?: string;
      reasoning?: boolean | string;
    };

    const prepared = aiManager.prepareRegenerate(messageId);
    if (!prepared) {
      reply.status(404).send({ success: false, error: '消息不存在或不是助手消息' });
      return;
    }

    const providerName = aiConfig.config.current_provider;
    const providerConfig = getProviderConfigFromDB(providerName);
    if (!providerConfig) {
      reply.status(400).send({ success: false, error: 'Provider 未配置' });
      return;
    }
    if (!providerConfig.api_key) {
      const dbKey = getProviderApiKeyFromDB(providerName);
      if (dbKey) providerConfig.api_key = dbKey;
    }
    if (!providerConfig.api_key && !isKeylessProvider(providerName)) {
      reply.status(400).send({ success: false, error: 'AI API Key 未设置' });
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const stream = aiManager.regenerateStream(
      prepared.parentMessageId ?? messageId,
      payload.model,
      payload.mode,
      payload.reasoning,
    );
    await processChatStream(stream, reply);
  });
}
