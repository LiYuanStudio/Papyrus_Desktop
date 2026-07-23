import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createKnowledgeBranch,
  createKnowledgeBranchFromVersion,
  createKnowledgeVersion,
  deleteKnowledgeBranch,
  deleteKnowledgeVersion,
  getKnowledgeVersionState,
  KnowledgeVersionError,
  renameKnowledgeBranch,
  renameKnowledgeVersion,
  restoreKnowledgeVersion,
  switchKnowledgeBranch,
} from '../../core/knowledge-versioning.js';

const versionParamsSchema = z.object({
  versionId: z.string().uuid(),
});

const branchParamsSchema = z.object({
  branchId: z.string().min(1),
});

const createVersionBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const renameVersionBodySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const branchNameBodySchema = z.object({
  name: z.string(),
});

// 把路由异常映射为稳定 JSON，输入请求、响应与未知异常，无返回值。
// 原因：业务错误需要保留 404/409/422，校验错误统一返回 422，其余异常隐藏内部路径。
// 未在每个 handler 重复 catch：集中处理可保证所有版本操作契约一致。
function sendVersionError(
  request: FastifyRequest,
  reply: FastifyReply,
  error: unknown,
): void {
  if (error instanceof KnowledgeVersionError) {
    reply.status(error.statusCode).send({
      success: false,
      code: error.code,
      error: error.message,
    });
    return;
  }
  if (error instanceof z.ZodError) {
    reply.status(422).send({
      success: false,
      code: 'VALIDATION_ERROR',
      error: error.issues[0]?.message ?? 'Invalid request',
    });
    return;
  }
  request.log.error({ err: error }, 'Knowledge version operation failed');
  reply.status(500).send({
    success: false,
    code: 'VERSION_OPERATION_FAILED',
    error: 'Knowledge version operation failed',
  });
}

// 注册知识库版本与分支 API，输入 Fastify 实例，输出异步注册完成信号。
// 原因：知识库版本与单笔记/卡片历史语义不同，使用独立路径避免冲突。
// 未拆成两个路由文件：两类资源共享错误处理和原子切换流程，集中维护更清晰。
export default async function knowledgeVersionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/knowledge-versions', async (request, reply) => {
    try {
      const state = await getKnowledgeVersionState();
      reply.send({ success: true, ...state });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.post('/knowledge-versions', async (request, reply) => {
    try {
      const body = createVersionBodySchema.parse(request.body);
      const version = await createKnowledgeVersion(body);
      reply.status(201).send({ success: true, version });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.patch('/knowledge-versions/:versionId', async (request, reply) => {
    try {
      const { versionId } = versionParamsSchema.parse(request.params);
      const body = renameVersionBodySchema.parse(request.body);
      const version = await renameKnowledgeVersion(versionId, body);
      reply.send({ success: true, version });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.delete('/knowledge-versions/:versionId', async (request, reply) => {
    try {
      const { versionId } = versionParamsSchema.parse(request.params);
      await deleteKnowledgeVersion(versionId);
      reply.send({ success: true });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.post('/knowledge-versions/:versionId/restore', async (request, reply) => {
    try {
      const { versionId } = versionParamsSchema.parse(request.params);
      const state = await restoreKnowledgeVersion(versionId);
      reply.send({ success: true, ...state });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.post('/knowledge-versions/:versionId/branch', async (request, reply) => {
    try {
      const { versionId } = versionParamsSchema.parse(request.params);
      const { name } = branchNameBodySchema.parse(request.body);
      const state = await createKnowledgeBranchFromVersion(versionId, name);
      reply.status(201).send({ success: true, ...state });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.get('/knowledge-branches', async (request, reply) => {
    try {
      const state = await getKnowledgeVersionState();
      reply.send({
        success: true,
        branches: state.branches,
        activeBranch: state.activeBranch,
      });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.post('/knowledge-branches', async (request, reply) => {
    try {
      const { name } = branchNameBodySchema.parse(request.body);
      const state = await createKnowledgeBranch(name);
      reply.status(201).send({ success: true, ...state });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.patch('/knowledge-branches/:branchId', async (request, reply) => {
    try {
      const { branchId } = branchParamsSchema.parse(request.params);
      const { name } = branchNameBodySchema.parse(request.body);
      const branch = await renameKnowledgeBranch(branchId, name);
      reply.send({ success: true, branch });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.delete('/knowledge-branches/:branchId', async (request, reply) => {
    try {
      const { branchId } = branchParamsSchema.parse(request.params);
      await deleteKnowledgeBranch(branchId);
      reply.send({ success: true });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });

  fastify.post('/knowledge-branches/:branchId/switch', async (request, reply) => {
    try {
      const { branchId } = branchParamsSchema.parse(request.params);
      const state = await switchKnowledgeBranch(branchId);
      reply.send({ success: true, ...state });
    } catch (error) {
      sendVersionError(request, reply, error);
    }
  });
}
