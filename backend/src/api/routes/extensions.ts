import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseExtensionManifestFromZip } from '#/core/extension-package.js';
import { addExtensionEventClient } from '#/core/extension-events.js';
import {
  loadAllExtensions,
  getExtensionById,
  installExtension,
  uninstallExtension,
  setExtensionEnabled,
  checkExtensionUpdates,
  updateExtensionConfig,
  getExtensionStats,
  type CreateExtensionInput,
} from '#/db/database.js';

export interface ExtensionInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  type: string;
  author: string;
  rating: number;
  downloads: number;
  isEnabled: boolean;
  updateAvailable?: boolean;
  tags: string[];
  isBuiltin?: boolean;
  latestVersion?: string;
  config: Record<string, unknown>;
}

function toApiFormat(ext: {
  id: string;
  name: string;
  description: string;
  version: string;
  type: string;
  author: string;
  rating: number;
  downloads: number;
  is_enabled: boolean;
  is_builtin: boolean;
  update_available: boolean;
  latest_version: string | null;
  tags: string[];
  config: Record<string, unknown>;
}): ExtensionInfo {
  return {
    id: ext.id,
    name: ext.name,
    description: ext.description,
    version: ext.version,
    type: ext.type,
    author: ext.author,
    rating: ext.rating,
    downloads: ext.downloads,
    isEnabled: ext.is_enabled,
    isBuiltin: ext.is_builtin,
    updateAvailable: ext.update_available,
    latestVersion: ext.latest_version ?? undefined,
    tags: ext.tags,
    config: ext.config,
  };
}

export function getExtensionsList(): ExtensionInfo[] {
  const extensions = loadAllExtensions();
  return extensions.map(toApiFormat);
}

const InstallExtensionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  rating: z.number().optional(),
  downloads: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

const LocalZipInstallSchema = z.object({
  filename: z.string().optional(),
  content: z.string().min(1),
});

export default async function extensionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/events', async (_request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    reply.raw.write(': connected\n\n');
    addExtensionEventClient(reply.raw);
  });

  fastify.get('/', async (request, reply) => {
    try {
      const extensions = getExtensionsList();
      const stats = getExtensionStats();
      return reply.send({
        success: true,
        count: extensions.length,
        stats,
        extensions,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.get('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const ext = getExtensionById(id);
      if (!ext) {
        return reply.status(404).send({ success: false, error: '扩展不存在' });
      }
      return reply.send({
        success: true,
        extension: toApiFormat(ext),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/', async (request, reply) => {
    try {
      const parseResult = InstallExtensionSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: parseResult.error.errors.map(e => e.message).join('; '),
        });
      }
      const input: CreateExtensionInput = parseResult.data;
      const existing = getExtensionById(input.id);
      if (existing) {
        return reply.status(409).send({ success: false, error: '该扩展已安装' });
      }
      const ext = installExtension(input);
      return reply.send({
        success: true,
        extension: toApiFormat(ext),
        message: '扩展安装成功',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/install-local', async (request, reply) => {
    try {
      const parseResult = LocalZipInstallSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: parseResult.error.errors.map(e => e.message).join('; '),
        });
      }
      console.log(`[extensions] installing local package: ${parseResult.data.filename ?? 'extension.zip'}`);
      const manifest = parseExtensionManifestFromZip(Buffer.from(parseResult.data.content, 'base64'));
      const existing = getExtensionById(manifest.id);
      if (existing) {
        return reply.status(409).send({ success: false, error: '该扩展已安装' });
      }
      const ext = installExtension({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        description: manifest.description,
        author: manifest.author,
        tags: manifest.tags,
      });
      if (manifest.config) {
        updateExtensionConfig(manifest.id, manifest.config);
      }
      const installed = getExtensionById(manifest.id) ?? ext;
      return reply.send({
        success: true,
        extension: toApiFormat(installed),
        manifest,
        message: '本地扩展安装成功',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      console.log('[extensions] local install failed:', message);
      return reply.status(400).send({ success: false, error: message });
    }
  });

  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const ext = getExtensionById(id);
      if (!ext) {
        return reply.status(404).send({ success: false, error: '扩展不存在' });
      }
      if (ext.is_builtin) {
        return reply.status(403).send({ success: false, error: '无法卸载内置扩展' });
      }
      const success = uninstallExtension(id);
      if (!success) {
        return reply.status(500).send({ success: false, error: '卸载失败' });
      }
      return reply.send({ success: true, message: '扩展已卸载' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  const EnabledSchema = z.object({ enabled: z.boolean() });

  fastify.post('/:id/enabled', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parseResult = EnabledSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: parseResult.error.errors.map(e => e.message).join('; '),
        });
      }
      const ext = getExtensionById(id);
      if (!ext) {
        return reply.status(404).send({ success: false, error: '扩展不存在' });
      }
      setExtensionEnabled(id, parseResult.data.enabled);
      return reply.send({
        success: true,
        message: `扩展已${parseResult.data.enabled ? '启用' : '禁用'}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/check-updates', async (request, reply) => {
    try {
      const updates = checkExtensionUpdates();
      const extensions = getExtensionsList();
      const extensionsWithUpdates = extensions.filter(e => e.updateAvailable);
      return reply.send({
        success: true,
        hasUpdates: updates.length > 0,
        updateCount: updates.length,
        updates,
        extensions: extensionsWithUpdates,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  const ConfigSchema = z.record(z.unknown());

  fastify.put('/:id/config', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parseResult = ConfigSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: parseResult.error.errors.map(e => e.message).join('; '),
        });
      }
      const ext = getExtensionById(id);
      if (!ext) {
        return reply.status(404).send({ success: false, error: '扩展不存在' });
      }
      updateExtensionConfig(id, parseResult.data);
      return reply.send({ success: true, message: '配置已更新' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
