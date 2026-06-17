import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { paths } from '../utils/paths.js';
import { PapyrusLogger } from '../utils/logger.js';
import { MCPServer } from '../mcp/server.js';
import { startFileWatching, stopFileWatching } from '../integrations/file-watcher.js';
import { setGlobalLogger } from './routes/logs.js';
import { isAuthEnabled, validateRequestToken } from '../utils/auth.js';
import { closeDb } from '../db/database.js';

const logger = new PapyrusLogger(
  paths.logDir,
  'INFO',
  10,
  false
);

const app = Fastify({
  logger: {
    level: 'warn',
  },
});

// Error handler — sanitize error messages in production to avoid info leakage
const isDebugMode = process.env.PAPYRUS_DEBUG === '1' || process.env.NODE_ENV === 'development';
app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
  const errorId = randomUUID().slice(0, 8);
  const status = error.statusCode ?? 500;

  if (status >= 500) {
    const ctx = {
      errorId,
      method: request.method,
      url: request.url,
      params: logger.sanitize(request.params),
      query: logger.sanitize(request.query),
      body: logger.sanitize(request.body),
    };
    logger.error(
      `API Error [${errorId}] ${request.method} ${request.url}: ${error.message}\n` +
      `Context: ${JSON.stringify(ctx)}\n` +
      `Stack: ${error.stack ?? '(no stack)'}`
    );
  } else {
    logger.error(`API Error [${errorId}] ${request.method} ${request.url} ${status}: ${error.message}`);
  }

  reply.status(status).send({
    success: false,
    error: isDebugMode ? error.message : 'Internal server error',
    errorId,
  });
});

// Not found handler
app.setNotFoundHandler((_request, reply) => {
  reply.status(404).send({ success: false, error: 'Not found' });
});

// Security headers
app.addHook('onSend', async (_request, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

const PORT = process.env.PAPYRUS_PORT ? parseInt(process.env.PAPYRUS_PORT, 10) : 8000;

export async function initApp(): Promise<void> {
  setGlobalLogger(logger);
  const { initAIConfig, aiConfig } = await import('../ai/config-instance.js');
  initAIConfig();
  // 同步持久化日志配置到全局 logger
  const logConfig = aiConfig.getLogConfig();
  if (logConfig.log_dir) logger.setLogDir(logConfig.log_dir);
  if (logConfig.log_level) logger.setLogLevel(logConfig.log_level);
  if (logConfig.max_log_files !== undefined) logger.setMaxLogFiles(logConfig.max_log_files);
  if (logConfig.log_rotation !== undefined) logger.setLogRotation(logConfig.log_rotation);
  const allowedPorts = new Set([5173, 4173, 8000, 3000, 9100, 9200]);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      try {
        const parsed = new URL(origin);
        const hostname = parsed.hostname;
        const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === 'https:' ? 443 : 80);
        if (
          parsed.protocol === 'http:' &&
          (hostname === 'localhost' || hostname === '127.0.0.1') &&
          allowedPorts.has(port)
        ) {
          cb(null, true);
          return;
        }
      } catch {
        // ignore invalid origins
      }
      cb(new Error('Not allowed'), false);
    },
    credentials: true,
  });

  // Rate limiting — 5000 requests per minute per IP (localhost-only desktop app)
  // Disabled in test to avoid flakiness across shared test instances
  const isTestEnv = process.env.NODE_ENV === 'test';
  await app.register(rateLimit, {
    max: isTestEnv ? Number.MAX_SAFE_INTEGER : 5000,
    timeWindow: '1 minute',
  });

  // Optional lightweight auth for local API protection
  // When PAPYRUS_AUTH_TOKEN is set (Electron mode), require it for mutating operations
  if (isAuthEnabled()) {
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
        return;
      }
      if (request.url === '/api/health') {
        return;
      }
      const token = request.headers['x-papyrus-token'];
      if (!validateRequestToken(typeof token === 'string' ? token : undefined)) {
        reply.status(401).send({ success: false, error: 'Unauthorized' });
        return;
      }
    });
  }

  // Health check
  app.get('/api/health', async () => ({ status: 'ok' }));

  // Register routes
  const { default: cardsRoutes } = await import('./routes/cards.js');
  const { default: reviewRoutes } = await import('./routes/review.js');
  const { default: notesRoutes } = await import('./routes/notes.js');
  const { default: searchRoutes } = await import('./routes/search.js');
  const { default: aiRoutes } = await import('./routes/ai.js');
  const { default: dataRoutes } = await import('./routes/data.js');
  const { default: progressRoutes } = await import('./routes/progress.js');
  const { default: logsRoutes } = await import('./routes/logs.js');
  const { default: markdownRoutes } = await import('./routes/markdown.js');
  const { default: providersRoutes } = await import('./routes/providers.js');
  const { default: updateRoutes } = await import('./routes/update.js');
  const { default: mcpRoutes } = await import('./routes/mcp.js');
  const { default: noteVersionRoutes } = await import('./routes/note-versions.js');
  const { default: cardVersionRoutes } = await import('./routes/card-versions.js');
  const { default: filesRoutes } = await import('./routes/files.js');
  const { default: relationsRoutes } = await import('./routes/relations.js');
  const { default: extensionsRoutes } = await import('./routes/extensions.js');
  const { default: cliRoutes } = await import('./routes/cli.js');
  const { default: uiSettingsRoutes } = await import('./routes/ui-settings.js');

  app.register(cardsRoutes, { prefix: '/api/cards' });
  app.register(reviewRoutes, { prefix: '/api/review' });
  app.register(notesRoutes, { prefix: '/api/notes' });
  app.register(searchRoutes, { prefix: '/api/search' });
  app.register(aiRoutes, { prefix: '/api' });
  app.register(dataRoutes, { prefix: '/api' });
  app.register(progressRoutes, { prefix: '/api/progress' });
  app.register(logsRoutes, { prefix: '/api/config/logs' });
  app.register(markdownRoutes, { prefix: '/api/markdown' });
  app.register(providersRoutes, { prefix: '/api/providers' });
  app.register(updateRoutes, { prefix: '/api/update' });
  app.register(mcpRoutes, { prefix: '/api/mcp' });
  app.register(noteVersionRoutes, { prefix: '/api/notes/:noteId' });
  app.register(cardVersionRoutes, { prefix: '/api/cards/:cardId' });
  app.register(filesRoutes, { prefix: '/api/files' });
  app.register(relationsRoutes, { prefix: '/api' });
  app.register(extensionsRoutes, { prefix: '/api/extensions' });
  app.register(cliRoutes, { prefix: '/api/cli' });
  app.register(uiSettingsRoutes, { prefix: '/api/ui-settings' });
}

let mcpServer: MCPServer | null = null;

export async function start(): Promise<void> {
  await initApp();
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    logger.info(`Papyrus backend started on http://127.0.0.1:${PORT}`);

    mcpServer = new MCPServer({ logger });
    await mcpServer.start();

    startFileWatching((eventType, filePath) => {
      logger.info(`文件${eventType}: ${filePath}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err}`);
    throw err;
  }
}

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    if (mcpServer) {
      await mcpServer.stop();
      mcpServer = null;
    }
    stopFileWatching();
    await app.close();
    closeDb();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, logger, gracefulShutdown };

// Start if run directly
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await start();
}

