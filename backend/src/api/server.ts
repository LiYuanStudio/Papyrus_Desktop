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
import {
  ensureAuthToken,
  extractRequestToken,
  isPublicApiPath,
  allowsQueryTokenAuth,
  validateRequestToken,
} from '../utils/auth.js';
import { closeDb } from '../db/database.js';
import {
  broadcastFileChange,
  registerRealtimeWebSocket,
} from './realtime-websocket.js';

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
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
});

const PORT = process.env.PAPYRUS_PORT ? parseInt(process.env.PAPYRUS_PORT, 10) : 8000;

export async function initApp(): Promise<void> {
  ensureAuthToken();
  setGlobalLogger(logger);
  const { initAIConfig, aiConfig } = await import('../ai/config-instance.js');
  initAIConfig();
  // 同步持久化日志配置到全局 logger
  const logConfig = aiConfig.getLogConfig();
  if (logConfig.log_dir) logger.setLogDir(logConfig.log_dir);
  if (logConfig.log_level) logger.setLogLevel(logConfig.log_level);
  if (logConfig.max_log_files !== undefined) logger.setMaxLogFiles(logConfig.max_log_files);
  if (logConfig.log_rotation !== undefined) logger.setLogRotation(logConfig.log_rotation);
  // CORS 白名单只保留实际使用的 loopback 端口：Vite dev(5173)/preview(4173)、
  // PAPYRUS_PORT 后端自身、E2E 动态端口。
  // 原因：3000/9100/9200 无任何应用使用，却让本机任意进程绑定这些端口即可获得
  //       credentials:true 的可信 origin，配合 token 泄露即完整读写 API。
  // 未全部删除 localhost origin：浏览器开发模式（Vite 5173）依赖同源策略放行。
  const allowedPorts = new Set([5173, 4173, 8000]);
  const configuredBackendPort = Number(process.env.PAPYRUS_PORT);
  const configuredE2ePortBase = Number(process.env.PAPYRUS_E2E_PORT_BASE);
  if (Number.isInteger(configuredBackendPort) && configuredBackendPort > 0 && configuredBackendPort <= 65535) {
    allowedPorts.add(configuredBackendPort);
  }
  if (
    Number.isInteger(configuredE2ePortBase)
    && configuredE2ePortBase > 0
    && configuredE2ePortBase < 65535
  ) {
    // E2E 使用相邻动态端口启动后端与 Vite；只放行当前进程明确配置的两个 loopback 端口。
    // 未放行所有本地端口：任意 localhost origin 仍可能代表不受信任网页，保持原有 CORS 最小白名单。
    allowedPorts.add(configuredE2ePortBase);
    allowedPorts.add(configuredE2ePortBase + 1);
  }
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

  await registerRealtimeWebSocket(app);

  // Local API protection: require token on all /api routes except /api/health.
  // 钩子无条件注册：启动中途 token 文件被删/损坏时，validateRequestToken 的 fail-closed
  // 分支仍然生效；若仅在 isAuthEnabled() 时注册，同样的场景会让所有路由退化为免认证。
  {
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'OPTIONS') {
        return;
      }
      const requestPath = request.url.split('?')[0] ?? request.url;
      if (isPublicApiPath(requestPath)) {
        return;
      }
      if (!requestPath.startsWith('/api/')) {
        return;
      }

      const query = request.query as { access_token?: string };
      const queryToken = allowsQueryTokenAuth(request.url) ? query.access_token : undefined;
      const token = extractRequestToken(request.headers['x-papyrus-token'], queryToken);
      if (!validateRequestToken(token)) {
        reply.status(401).send({ success: false, error: 'Unauthorized' });
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
  const { default: aiRoutes, aiManager } = await import('./routes/ai.js');
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
  const { default: knowledgeVersionRoutes } = await import('./routes/knowledge-versions.js');
  const { default: automationRoutes } = await import('./routes/automations.js');
  const { initializeAutomationScheduler } = await import('../core/automation-scheduler.js');
  initializeAutomationScheduler(aiManager, logger);

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
  app.register(knowledgeVersionRoutes, { prefix: '/api' });
  app.register(automationRoutes, { prefix: '/api/automations' });
}

let mcpServer: MCPServer | null = null;

export async function start(): Promise<void> {
  await initApp();
  try {
    await app.listen({ port: PORT, host: '127.0.0.1' });
    logger.info(`Papyrus backend started on http://127.0.0.1:${PORT}`);

    const { getAuthToken } = await import('../utils/auth.js');
    mcpServer = new MCPServer({ logger, authToken: getAuthToken() ?? undefined });
    await mcpServer.start();

    startFileWatching((eventType, filePath) => {
      logger.info(`文件${eventType}: ${filePath}`);
      broadcastFileChange(eventType, filePath);
    });
    const { getAutomationScheduler } = await import('../core/automation-scheduler.js');
    getAutomationScheduler().start();
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
    const { getAutomationScheduler } = await import('../core/automation-scheduler.js');
    getAutomationScheduler().stop();
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
