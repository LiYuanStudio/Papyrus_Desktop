import type { FastifyInstance } from 'fastify';
import { getCardHistory, rollbackCard } from '../../core/versioning.js';
import { getAllCards } from '../../core/cards.js';

export default async function cardVersionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/history', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    const cards = getAllCards();
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      reply.status(404).send({ success: false, error: 'Card not found' });
      return;
    }
    const history = getCardHistory(cardId);
    reply.send({ success: true, history, count: history.length });
  });

  fastify.get('/history/:versionId', async (request, reply) => {
    const { cardId, versionId } = request.params as { cardId: string; versionId: string };
    const cards = getAllCards();
    const card = cards.find(c => c.id === cardId);
    if (!card) {
      reply.status(404).send({ success: false, error: 'Card not found' });
      return;
    }
    const history = getCardHistory(cardId);
    const version = history.find(v => v.version_id === versionId);
    if (!version) {
      reply.status(404).send({ success: false, error: 'Version not found' });
      return;
    }
    reply.send({ success: true, version });
  });

  fastify.post('/rollback/:versionId', async (request, reply) => {
    const { cardId, versionId } = request.params as { cardId: string; versionId: string };
    const result = rollbackCard(cardId, versionId);
    if (!result) {
      reply.status(404).send({ success: false, error: 'Card or version not found' });
      return;
    }
    reply.send({ success: true, card: result });
  });
}
