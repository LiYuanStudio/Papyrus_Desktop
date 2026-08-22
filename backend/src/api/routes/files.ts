import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import sharp from 'sharp';
import { listFiles, createFolder, saveFile, deleteFileItem, getFileById, isSafeFileStoragePath } from '../../core/files.js';
import { routeErrorMessage } from '../../utils/route-error.js';

const MAX_PREVIEW_SIZE = 10 * 1024 * 1024;
const THUMBNAIL_SIZE = 128;
const INLINE_PREVIEW_MIME_TYPES = new Set(['application/pdf']);
const INLINE_PREVIEW_PREFIXES = ['image/', 'text/'];

function shouldServeInline(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  if (INLINE_PREVIEW_MIME_TYPES.has(mimeType)) return true;
  return INLINE_PREVIEW_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

export default async function filesRoutes(fastify: FastifyInstance): Promise<void> {
  // List all files/folders
  fastify.get('/', async (_request, reply) => {
    try {
      const files = listFiles();
      reply.send({ success: true, files, count: files.length });
    } catch (err) {
      _request.log.error({ err }, 'Failed to load files');
      reply.status(500).send({ success: false, error: 'Failed to load files' });
    }
  });

  // Get single file
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);
    if (!file) {
      reply.status(404).send({ success: false, error: '文件不存在' });
      return;
    }
    reply.send({ success: true, file });
  });

  // Create folder
  fastify.post('/folder', async (request, reply) => {
    try {
      const body = request.body as { name?: string; parentId?: string };
      if (!body.name || !body.name.trim()) {
        reply.status(400).send({ success: false, error: '文件夹名称不能为空' });
        return;
      }
      const folder = createFolder(body.name, body.parentId);
      reply.send({ success: true, file: folder });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: routeErrorMessage(err, '创建文件夹失败') });
    }
  });

  // Upload file(s) — accepts JSON with base64 content
  fastify.post('/upload', async (request, reply) => {
    try {
      const body = request.body as {
        files: Array<{ name: string; content: string; mimeType?: string }>;
        parentId?: string;
      };

      if (!body.files || body.files.length === 0) {
        reply.status(400).send({ success: false, error: '未提供文件' });
        return;
      }

      const saved: Array<{ id: string; name: string; size: number }> = [];
      const errors: Array<{ name: string; error: string }> = [];
      for (const f of body.files) {
        if (!f.name || !f.content) {
          errors.push({ name: f.name || '(未命名)', error: '缺少名称或内容' });
          continue;
        }
        try {
          const record = saveFile(f.name, f.content, f.mimeType, body.parentId);
          saved.push({ id: record.id, name: record.name, size: record.size });
        } catch (saveErr) {
          // 逐文件错误同样可能包含磁盘/数据库内部细节，统一走 debug 门控消毒。
          errors.push({ name: f.name, error: routeErrorMessage(saveErr, '保存失败') });
        }
      }

      if (saved.length === 0) {
        reply.status(400).send({ success: false, error: '所有文件均保存失败', errors });
        return;
      }

      reply.send({ success: true, files: saved, count: saved.length, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: routeErrorMessage(err, '上传文件失败') });
    }
  });

  // Preview file (inline, not attachment)
  fastify.get('/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path) || !isSafeFileStoragePath(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    if (file.size > MAX_PREVIEW_SIZE) {
      reply.status(413).send({ success: false, error: '文件过大，请下载查看' });
      return;
    }

    const content = fs.readFileSync(file.file_storage_path);
    reply.type(file.mime_type || 'application/octet-stream');
    if (shouldServeInline(file.mime_type)) {
      reply.header('Content-Disposition', 'inline');
      reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    } else {
      reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    }
    reply.header('Content-Length', file.size);
    reply.send(content);
  });

  // Download file
  fastify.get('/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path) || !isSafeFileStoragePath(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    const stream = fs.createReadStream(file.file_storage_path);
    reply.type(file.mime_type || 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    reply.header('Content-Length', file.size);

    stream.on('error', (err) => {
      request.log.error({ err }, '文件下载流错误');
      if (!reply.sent) {
        reply.status(500).send({ success: false, error: '文件读取失败' });
      }
    });

    reply.send(stream);
  });

  // Thumbnail endpoint for images
  fastify.get('/:id/thumbnail', async (request, reply) => {
    const { id } = request.params as { id: string };
    const file = getFileById(id);

    if (!file || !file.file_storage_path || !fs.existsSync(file.file_storage_path) || !isSafeFileStoragePath(file.file_storage_path)) {
      reply.status(404).send({ success: false, error: '文件不存在或已被删除' });
      return;
    }

    if (!file.mime_type?.startsWith('image/')) {
      reply.status(400).send({ success: false, error: '仅支持图片文件生成缩略图' });
      return;
    }

    try {
      const thumbnailBuffer = await sharp(file.file_storage_path)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit: 'cover',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      reply.type('image/jpeg');
      reply.header('Content-Length', thumbnailBuffer.length);
      reply.header('Cache-Control', 'public, max-age=86400');
      reply.send(thumbnailBuffer);
    } catch (err) {
      request.log.error({ err }, '生成缩略图失败');
      reply.status(500).send({ success: false, error: '生成缩略图失败' });
    }
  });

  // Delete file/folder
  fastify.delete('/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const file = getFileById(id);
      if (!file) {
        reply.status(404).send({ success: false, error: '文件不存在' });
        return;
      }
      const result = deleteFileItem(id);
      reply.send({ success: true, deleted: result.deleted });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });
}
