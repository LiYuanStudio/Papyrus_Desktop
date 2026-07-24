import type { FastifyInstance } from 'fastify';
import { getNextDueCard, rateCard, getCardStats, undoCardRating } from '../../core/cards.js';
import { pushExtensionEvent } from '#/core/extension-events.js';

export default async function reviewRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { tag?: string } }>('/next', async (request, reply) => {
    try {
      const tag = request.query.tag;
      const card = getNextDueCard(tag);
      const stats = getCardStats(tag);
      if (!card) {
        reply.send({
          success: true,
          card: null,
          due_count: stats.due,
          total_count: stats.total,
          message: 'No cards due for review',
        });
        return;
      }
      reply.send({
        success: true,
        card,
        due_count: stats.due,
        total_count: stats.total,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Params: { cardId: string };
    Body: { grade?: number };
    Querystring: { tag?: string };
  }>('/:cardId/rate', async (request, reply) => {
    try {
      const { cardId } = request.params;
      const { grade } = request.body;
      const tag = request.query.tag;

      if (grade !== 1 && grade !== 2 && grade !== 3) {
        reply.status(400).send({ success: false, error: 'Grade must be 1, 2, or 3' });
        return;
      }

      const result = await rateCard(cardId, grade);
      if (!result) {
        reply.status(404).send({ success: false, error: 'Card not found' });
        return;
      }
      pushExtensionEvent('card.review.completed', {
        card_id: cardId,
        grade,
        interval_days: result.intervalDays,
        ef: result.ef,
      });

      const next = getNextDueCard(tag);
      const stats = getCardStats(tag);
      reply.send({
        success: true,
        card: result.card,
        interval_days: result.intervalDays,
        ef: result.ef,
        review_id: result.reviewId,
        next: {
          success: true,
          card: next,
          due_count: stats.due,
          total_count: stats.total,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.post<{
    Params: { cardId: string };
    Body: { review_id?: string };
    Querystring: { tag?: string };
  }>('/:cardId/undo', async (request, reply) => {
    try {
      const { cardId } = request.params;
      const reviewId = request.body?.review_id;
      if (typeof reviewId !== 'string' || reviewId.length === 0) {
        reply.status(400).send({ success: false, error: 'review_id is required' });
        return;
      }

      const result = await undoCardRating(cardId, reviewId);
      if (result.status === 'unavailable') {
        reply.status(409).send({ success: false, error: 'Review can no longer be undone' });
        return;
      }
      if (result.status === 'conflict') {
        reply.status(409).send({ success: false, error: 'Card was reviewed again after this action' });
        return;
      }

      const stats = getCardStats(request.query.tag);
      reply.send({
        success: true,
        card: result.card,
        due_count: stats.due,
        total_count: stats.total,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '服务器内部错误';
      request.log.error({ err }, message);
      reply.status(500).send({ success: false, error: message });
    }
  });
}
