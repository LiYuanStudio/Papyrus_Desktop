import type { FastifyInstance } from 'fastify';
import {
  getNoteRelations,
  createRelation,
  updateRelation,
  deleteRelation,
  searchForRelation,
  getNoteGraph,
} from '../../core/relations.js';
import { getNoteById } from '../../core/notes.js';

export default async function relationsRoutes(fastify: FastifyInstance): Promise<void> {
  // 获取笔记的关联列表
  fastify.get('/notes/:noteId/relations', async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const note = getNoteById(noteId);
    if (!note) {
      reply.status(404).send({ success: false, error: '笔记不存在' });
      return;
    }
    const data = getNoteRelations(noteId);
    // 补充笔记标题和文件夹信息
    const outgoing = data.outgoing.map(r => {
      const target = getNoteById(r.note_id);
      return { ...r, title: target?.title ?? '未知笔记', folder: target?.folder ?? '' };
    });
    const incoming = data.incoming.map(r => {
      const source = getNoteById(r.note_id);
      return { ...r, title: source?.title ?? '未知笔记', folder: source?.folder ?? '' };
    });
    reply.send({ success: true, outgoing, incoming });
  });

  // 搜索可关联的笔记
  fastify.get('/notes/search-for-relation', async (request, reply) => {
    try {
      const { query, exclude_note_id, limit } = request.query as {
        query?: string;
        exclude_note_id?: string;
        limit?: string;
      };
      if (!query || !query.trim()) {
        reply.status(400).send({ success: false, error: 'query is required' });
        return;
      }
      const parsedLimit = parseInt(limit ?? '10', 10);
      const safeLimit = Number.isNaN(parsedLimit) ? 10 : Math.min(20, Math.max(1, parsedLimit));
      const results = searchForRelation(
        query.trim(),
        exclude_note_id ?? '',
        safeLimit,
      );
      reply.send({ success: true, results });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  // 获取笔记关联图谱
  fastify.get('/notes/:noteId/graph', async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const { depth } = request.query as { depth?: string };
    const note = getNoteById(noteId);
    if (!note) {
      reply.status(404).send({ success: false, error: '笔记不存在' });
      return;
    }
    const data = getNoteGraph(noteId, Math.min(2, Math.max(1, parseInt(depth ?? '1', 10))));
    reply.send({ success: true, nodes: data.nodes, links: data.links });
  });

  // 创建关联
  fastify.post('/notes/:noteId/relations', async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const body = request.body as {
      target_id?: string;
      relation_type?: string;
      description?: string;
    };
    if (!body.target_id) {
      reply.status(400).send({ success: false, error: 'target_id is required' });
      return;
    }
    const source = getNoteById(noteId);
    const target = getNoteById(body.target_id);
    if (!source || !target) {
      reply.status(404).send({ success: false, error: '笔记不存在' });
      return;
    }
    if (noteId === body.target_id) {
      reply.status(400).send({ success: false, error: '不能将笔记关联到自身' });
      return;
    }
    try {
      const relationId = createRelation(
        noteId,
        body.target_id,
        body.relation_type ?? 'reference',
        body.description ?? '',
      );
      reply.send({ success: true, relation_id: relationId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE constraint failed')) {
        reply.status(409).send({ success: false, error: '该关联已存在' });
      } else {
        request.log.error({ err }, '创建关联失败');
        reply.status(500).send({ success: false, error: '创建关联失败' });
      }
    }
  });

  // 更新关联
  fastify.patch('/relations/:relationId', async (request, reply) => {
    const { relationId } = request.params as { relationId: string };
    const body = request.body as { relation_type?: string; description?: string };
    const success = updateRelation(relationId, {
      relation_type: body.relation_type,
      description: body.description,
    });
    if (!success) {
      reply.status(404).send({ success: false, error: '关联不存在' });
      return;
    }
    reply.send({ success: true });
  });

  // 删除关联
  fastify.delete('/relations/:relationId', async (request, reply) => {
    const { relationId } = request.params as { relationId: string };
    const success = deleteRelation(relationId);
    if (!success) {
      reply.status(404).send({ success: false, error: '关联不存在' });
      return;
    }
    reply.send({ success: true });
  });
}
