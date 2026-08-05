import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import {
  broadcastFileChange,
  clearRealtimeClients,
  registerRealtimeWebSocket,
} from '../../src/api/realtime-websocket.js';
import { TEST_AUTH_TOKEN } from '../test-auth.js';

function nextMessage(socket: { once: (event: string, listener: (data: unknown) => void) => void }): Promise<string> {
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve(String(data)));
  });
}

interface TestSocket {
  readyState: number;
  once(event: string, listener: (data: unknown) => void): void;
  send(data: string): void;
  terminate(): void;
}

async function closeSocket(socket: TestSocket): Promise<void> {
  if (socket.readyState >= 2) return;
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    socket.terminate();
  });
}

describe('Realtime WebSocket', () => {
  let app: FastifyInstance;
  let sockets: TestSocket[];

  beforeEach(async () => {
    process.env.PAPYRUS_AUTH_TOKEN = TEST_AUTH_TOKEN;
    app = Fastify();
    sockets = [];
    await registerRealtimeWebSocket(app);
    await app.ready();
  });

  afterEach(async () => {
    await Promise.all(sockets.map(closeSocket));
    clearRealtimeClients();
    await app.close();
  });

  it('rejects a connection without the local API token', async () => {
    await expect(app.injectWS('/ws')).rejects.toThrow('Unexpected server response: 401');
  });

  it('accepts authentication from packaged query URLs', async () => {
    const socket = await app.injectWS(`/ws?access_token=${encodeURIComponent(TEST_AUTH_TOKEN)}`);
    sockets.push(socket);
  });

  it('accepts proxy authentication, heartbeats, and file change broadcasts', async () => {
    const socket = await app.injectWS('/ws', {
      headers: { 'x-papyrus-token': TEST_AUTH_TOKEN },
    });
    sockets.push(socket);

    const pongPromise = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'ping' }));
    expect(JSON.parse(await pongPromise)).toMatchObject({ type: 'pong' });

    const changePromise = nextMessage(socket);
    broadcastFileChange('modified', '/tmp/papyrus.sqlite');
    expect(JSON.parse(await changePromise)).toMatchObject({
      type: 'file_change',
      event: 'modified',
      path: '/tmp/papyrus.sqlite',
    });
  });
});
