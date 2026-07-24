import type { FastifyInstance } from 'fastify';
import { aiConfig } from '../../ai/config-instance.js';
import { aiManager } from './ai-chat.js';
import aiConfigRoutes from './ai-config.js';
import aiCompletionRoutes from './ai-completion.js';
import aiChatRoutes from './ai-chat.js';
import aiSessionsRoutes from './ai-sessions.js';
import aiMessagesRoutes from './ai-messages.js';
import aiToolsRoutes from './ai-tools.js';

export { aiConfig, aiManager };

export default async function aiRoutes(fastify: FastifyInstance): Promise<void> {
  await aiConfigRoutes(fastify);
  await aiCompletionRoutes(fastify);
  await aiChatRoutes(fastify);
  await aiSessionsRoutes(fastify);
  await aiMessagesRoutes(fastify);
  await aiToolsRoutes(fastify);
}