import type { FastifyInstance } from 'fastify';
import { getNoteHistory, rollbackNote } from '../../core/versioning.js';
import { getNoteById } from '../../core/notes.js';

export default async function noteVersionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/history', async (request, reply) => {
    const { noteId } = request.params as { noteId: string };
    const note = getNoteById(noteId);
    if (!note) {
      reply.status(404).send({ success: false, error: 'Note not found' });
      return;
    }
    const history = getNoteHistory(noteId);
    reply.send({ success: true, history, count: history.length });
  });

  fastify.get('/history/:versionId', async (request, reply) => {
    const { noteId, versionId } = request.params as { noteId: string; versionId: string };
    const note = getNoteById(noteId);
    if (!note) {
      reply.status(404).send({ success: false, error: 'Note not found' });
      return;
    }
    const history = getNoteHistory(noteId);
    const version = history.find(v => v.version_id === versionId);
    if (!version) {
      reply.status(404).send({ success: false, error: 'Version not found' });
      return;
    }
    reply.send({ success: true, version });
  });

  fastify.post('/rollback/:versionId', async (request, reply) => {
    const { noteId, versionId } = request.params as { noteId: string; versionId: string };
    const result = rollbackNote(noteId, versionId);
    if (!result) {
      reply.status(404).send({ success: false, error: 'Note or version not found' });
      return;
    }
    reply.send({ success: true, note: result });
  });
}
