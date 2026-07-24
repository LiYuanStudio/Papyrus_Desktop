import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { paths } from '../../utils/paths.js';
import { PapyrusLogger } from '../../utils/logger.js';
import { aiConfig } from './ai.js';
import { isPathInsideDirectory, resolveRealPathForSecurity } from '../../utils/security.js';

let globalLogger: PapyrusLogger | null = null;

export function setGlobalLogger(logger: PapyrusLogger): void {
  globalLogger = logger;
}

export default async function logsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    const config = globalLogger?.getConfig() ?? {
      log_dir: paths.logDir,
      log_level: 'DEBUG',
      max_log_files: 10,
      log_rotation: false,
    };
    reply.send({ success: true, config });
  });

  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      log_dir?: string;
      log_level?: string;
      max_log_files?: number;
      log_rotation?: boolean;
    };

    if (body.log_level && !['DEBUG', 'INFO', 'WARNING', 'ERROR'].includes(body.log_level.toUpperCase())) {
      reply.status(400).send({ success: false, error: 'Invalid log level' });
      return;
    }

    if (body.log_dir) {
      const resolvedLogDir = resolveRealPathForSecurity(body.log_dir);
      if (!isPathInsideDirectory(resolvedLogDir, paths.dataDir)) {
        reply.status(400).send({ success: false, error: 'Log directory must be within the application data directory' });
        return;
      }
      globalLogger?.setLogDir(body.log_dir);
    }
    if (body.log_level) {
      globalLogger?.setLogLevel(body.log_level);
    }
    if (body.max_log_files !== undefined) {
      globalLogger?.setMaxLogFiles(body.max_log_files);
    }
    if (body.log_rotation !== undefined) {
      globalLogger?.setLogRotation(body.log_rotation);
    }

    // Persist to ai_config.json
    const currentConfig = globalLogger?.getConfig();
    if (currentConfig) {
      aiConfig.setLogConfig(currentConfig);
    }

    reply.send({ success: true, message: 'Log configuration updated' });
  });

  fastify.post('/open-dir', async (_request, reply) => {
    const logDir = globalLogger?.getConfig().log_dir ?? paths.logDir;
    reply.send({ success: true, path: logDir, message: `Log directory: ${logDir}` });
  });

  fastify.get('/dir', async (_request, reply) => {
    const logDir = globalLogger?.getConfig().log_dir ?? paths.logDir;
    const files: Array<{ name: string; size: number; modified: string }> = [];

    if (fs.existsSync(logDir)) {
      const entries = fs.readdirSync(logDir);
      for (const name of entries) {
        if (name.endsWith('.log')) {
          const stat = fs.statSync(path.join(logDir, name));
          files.push({ name, size: stat.size, modified: stat.mtime.toISOString() });
        }
      }
      files.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    }

    reply.send({ success: true, path: logDir, files });
  });
}
