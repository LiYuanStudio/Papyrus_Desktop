import type { FastifyInstance } from 'fastify';
import { defaultCliManager } from '#/cli/cli-manager.js';
import { routeErrorMessage } from '../../utils/route-error.js';

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
      reply.status(500).send({ success: false, error: routeErrorMessage(err, 'CLI 状态检查失败') });
    }
  });

  fastify.post('/install', async (request, reply) => {
    try {
      reply.send(await defaultCliManager.install());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 安装失败';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: routeErrorMessage(err, 'CLI 安装失败') });
    }
  });

  fastify.post('/update', async (request, reply) => {
    try {
      reply.send(await defaultCliManager.update());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 更新失败';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: routeErrorMessage(err, 'CLI 更新失败') });
    }
  });

  fastify.post('/run', async (request, reply) => {
    let args: string[];
    try {
      args = readCliArgs(request.body as CliRunPayload | undefined);
    } catch (e) {
      // 入参校验错误面向调用方（描述请求体问题），保留原文便于修正请求；
      // 与内部执行错误区分开，后者才需要 debug 门控消毒。
      const message = e instanceof Error ? e.message : 'CLI 运行失败';
      request.log.warn({ err: e }, message);
      reply.status(400).send({ success: false, error: message });
      return;
    }
    try {
      reply.send(await defaultCliManager.run(args));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CLI 运行失败';
      request.log.warn({ err }, message);
      reply.status(400).send({ success: false, error: routeErrorMessage(err, 'CLI 运行失败') });
    }
  });
}
