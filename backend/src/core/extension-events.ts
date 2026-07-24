import type { ServerResponse } from 'node:http';
import { loadAllExtensions } from '#/db/database.js';

export interface ExtensionEvent {
  type: 'card.review.completed' | 'note.modified';
  payload: Record<string, unknown>;
  created_at: number;
}

const clients = new Set<ServerResponse>();

export function addExtensionEventClient(res: ServerResponse): void {
  clients.add(res);
  console.log(`[extensions] SSE client connected: ${clients.size}`);
  res.on('close', () => {
    clients.delete(res);
    console.log(`[extensions] SSE client disconnected: ${clients.size}`);
  });
  res.on('error', () => {
    clients.delete(res);
  });
}

export function pushExtensionEvent(type: ExtensionEvent['type'], payload: Record<string, unknown>): void {
  const enabledExtensions = loadAllExtensions().filter(ext => ext.is_enabled);
  if (enabledExtensions.length === 0) return;

  const event: ExtensionEvent = {
    type,
    payload,
    created_at: Date.now() / 1000,
  };
  console.log(`[extensions] push event ${type} to ${enabledExtensions.length} enabled extensions`);

  for (const client of clients) {
    try {
      client.write(`event: ${type}\n`);
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // 客户端已断开连接，移除并继续
      clients.delete(client);
    }
  }
}
