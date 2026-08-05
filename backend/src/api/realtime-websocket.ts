import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { extractRequestToken, validateRequestToken } from '../utils/auth.js';

interface RealtimeSocket {
  readyState: number;
  send(data: string): void;
  on(event: 'message', listener: (data: unknown) => void): void;
  on(event: 'close' | 'error', listener: () => void): void;
}

const OPEN_STATE = 1;
const clients = new Set<RealtimeSocket>();

export interface FileChangeMessage {
  type: 'file_change';
  event: string;
  path: string;
  timestamp: number;
}

export function broadcastFileChange(event: string, filePath: string): void {
  const message: FileChangeMessage = {
    type: 'file_change',
    event,
    path: filePath,
    timestamp: Date.now(),
  };
  const payload = JSON.stringify(message);

  for (const client of clients) {
    if (client.readyState === OPEN_STATE) {
      client.send(payload);
    }
  }
}

export async function registerRealtimeWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  app.get<{ Querystring: { access_token?: string } }>('/ws', {
    websocket: true,
    preValidation: async (request, reply) => {
      const token = extractRequestToken(
        request.headers['x-papyrus-token'],
        request.query.access_token,
      );
      if (!validateRequestToken(token)) {
        await reply.status(401).send({ success: false, error: 'Unauthorized' });
      }
    },
  }, (socket) => {
    clients.add(socket);

    socket.on('message', (data: unknown) => {
      try {
        const message = JSON.parse(String(data)) as { type?: unknown };
        if (message.type === 'ping' && socket.readyState === OPEN_STATE) {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // Ignore malformed client messages; the channel only accepts optional heartbeat pings.
      }
    });

    const removeClient = () => clients.delete(socket);
    socket.on('close', removeClient);
    socket.on('error', removeClient);
  });
}

export function clearRealtimeClients(): void {
  clients.clear();
}
