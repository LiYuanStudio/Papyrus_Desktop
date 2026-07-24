import type { FastifyInstance } from 'fastify';
import { defaultCliManager } from '#/cli/cli-manager.js';

interface CliRunPayload {
  args?: unknown;
}

function readCliArgs(payload: CliRunPayload | undefined): string[] {
  if (!payload || !Array.isArray(payload.args)) {
    throw new Error('args 字段必须是字符串数组');
  }
  if (!payload.args.every(item => typeof item === 'string')) {
    throw new Error('args 字段必须是字符串数组');
  }
  return payload.args;
}

export default async function cliRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/status', async (request, reply) => {
    try {
      reply.send(await defaultCliManager.getStatus());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 状态检查失败';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/install', async (request, reply) => {
    try {
      reply.send(await defaultCliManager.install());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 安装失败';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/update', async (request, reply) => {
    try {
      reply.send(await defaultCliManager.update());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 更新失败';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/run', async (request, reply) => {
    try {
      const args = readCliArgs(request.body as CliRunPayload | undefined);
      reply.send(await defaultCliManager.run(args));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 运行失败';
      request.log.warn({ err }, message);
      reply.status(400).send({ success: false, error: message });
    }
  });
}
