import type { FastifyInstance } from 'fastify';
import { getAllCards, createCard, updateCard, deleteCard, deleteCards, importCardsFromTxt } from '../../core/cards.js';
import { getCardById } from '../../db/database.js';
import { recordCardCreated } from '../../core/progress.js';

export default async function cardsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    const cards = getAllCards();
    reply.send({ success: true, cards, count: cards.length });
  });

  fastify.get('/:cardId', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const card = getCardById(cardId);
    if (!card) {
      reply.status(404).send({ success: false, error: 'Card not found' });
      return;
    }
    reply.send({ success: true, card });
  });

  fastify.post('/', async (request, reply) => {
    try {
      const body = request.body as { q?: string; question?: string; a?: string; answer?: string; tags?: string[] };
      const q = body.q ?? body.question ?? '';
      const a = body.a ?? body.answer ?? '';
      if (!q || !a) {
        reply.status(400).send({ success: false, error: 'Question and answer are required' });
        return;
      }
      const card = createCard(q, a, body.tags ?? []);
      recordCardCreated();
      reply.send({ success: true, card });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.delete('/:cardId', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const success = deleteCard(cardId);
    if (!success) {
      reply.status(404).send({ success: false, error: 'Card not found' });
      return;
    }
    reply.send({ success: true });
  });

  fastify.post('/batch-delete', async (request, reply) => {
    const body = request.body as { ids?: string[] };
    if (!body.ids || body.ids.length === 0) {
      reply.status(400).send({ success: false, error: 'ids is required' });
      return;
    }
    const deleted = deleteCards(body.ids);
    reply.send({ success: true, deleted });
  });

  fastify.patch('/:cardId', async (request, reply) => {
    try {
      const { cardId } = request.params as { cardId: string };
      const body = request.body as { q?: string; a?: string; tags?: string[] };
      const card = await updateCard(cardId, body);
      if (!card) {
        reply.status(404).send({ success: false, error: 'Card not found' });
        return;
      }
      reply.send({ success: true, card });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post('/import/txt', async (request, reply) => {
    try {
      const body = request.body as { content?: string };
      if (!body.content) {
        reply.status(400).send({ success: false, error: 'Content is required' });
        return;
      }
      const cards = importCardsFromTxt(body.content);
      for (const _c of cards) {
        recordCardCreated();
      }
      if (cards.length === 0) {
        reply.status(400).send({ success: false, error: 'No valid cards found' });
        return;
      }
      reply.send({ success: true, count: cards.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });
}
