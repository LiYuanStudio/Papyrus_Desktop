import type { FastifyInstance } from 'fastify';
import { loadAllNotes, loadAllCards, loadAllFiles } from '../../db/database.js';
import type { Note, FileRecord } from '../../core/types.js';

export default async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (request, reply) => {
    const { query, limit: limitStr, offset: offsetStr } = request.query as { query?: string; limit?: string; offset?: string };
    if (!query) {
      reply.send({ success: true, query: '', results: [], total: 0, notes_count: 0, cards_count: 0, files_count: 0 });
      return;
    }

    const lowerQuery = query.toLowerCase();
    const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);
    const offset = Math.max(parseInt(offsetStr ?? '0', 10) || 0, 0);

    let notes: Note[] = [];

    try {
      notes = loadAllNotes().filter(
        n => n.title.toLowerCase().includes(lowerQuery) ||
             n.content.toLowerCase().includes(lowerQuery) ||
             n.tags.some(t => t.toLowerCase().includes(lowerQuery))
      );
    } catch (err) {
      request.log.error({ err }, 'Failed to load notes for search');
      reply.status(500).send({ success: false, error: 'Failed to search notes' });
      return;
    }

    let cards: Array<{ id: string; q: string; a: string; tags: string[] }> = [];

    try {
      cards = loadAllCards().filter(
        c => c.q.toLowerCase().includes(lowerQuery) ||
             c.a.toLowerCase().includes(lowerQuery) ||
             c.tags.some(t => t.toLowerCase().includes(lowerQuery))
      );
    } catch (err) {
      request.log.error({ err }, 'Failed to load cards for search');
      reply.status(500).send({ success: false, error: 'Failed to search cards' });
      return;
    }

    let files: FileRecord[] = [];

    try {
      files = loadAllFiles().filter(
        f => f.name.toLowerCase().includes(lowerQuery) ||
             f.type.toLowerCase().includes(lowerQuery) ||
             f.mime_type.toLowerCase().includes(lowerQuery)
      );
    } catch (err) {
      request.log.error({ err }, 'Failed to load files for search');
      reply.status(500).send({ success: false, error: 'Failed to search files' });
      return;
    }

    const allResults = [
      ...notes.map(n => ({
        id: n.id,
        type: 'note' as const,
        title: n.title,
        preview: n.preview,
        folder: n.folder,
        tags: n.tags,
        matched_field: n.title.toLowerCase().includes(lowerQuery) ? 'title' :
                       n.content.toLowerCase().includes(lowerQuery) ? 'content' : 'tags',
        updated_at: n.updated_at,
      })),
      ...cards.map(c => ({
        id: c.id,
        type: 'card' as const,
        title: c.q,
        preview: c.a,
        folder: '',
        tags: c.tags,
        matched_field: c.q.toLowerCase().includes(lowerQuery) ? 'question' :
                       c.a.toLowerCase().includes(lowerQuery) ? 'answer' : 'tags',
        updated_at: 0,
      })),
      ...files.map(f => ({
        id: f.id,
        type: 'file' as const,
        title: f.name,
        preview: f.is_folder ? 'Folder' : f.mime_type || f.type,
        folder: '',
        tags: [],
        matched_field: f.name.toLowerCase().includes(lowerQuery) ? 'name' :
                       f.type.toLowerCase().includes(lowerQuery) ? 'file_type' : 'mime_type',
        updated_at: f.updated_at,
        parent_id: f.parent_id,
        is_folder: Boolean(f.is_folder),
        file_type: f.type,
        mime_type: f.mime_type,
      })),
    ];

    const total = allResults.length;
    const results = allResults.slice(offset, offset + limit);

    reply.send({
      success: true,
      query,
      results,
      total,
      notes_count: notes.length,
      cards_count: cards.length,
      files_count: files.length,
      limit,
      offset,
    });
  });
}
