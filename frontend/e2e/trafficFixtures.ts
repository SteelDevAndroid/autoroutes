import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { test as base, expect } from './fixtures';

interface Frame {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** Un vrai flux HTTP ouvert : permet de contrôler péremption, coupure et confirmation après reconnexion. */
async function createTestStream(origin: string) {
  const clients = new Set<ServerResponse>();
  const latest = new Map<string, Frame>();
  const encode = (message: Frame) => `event: ${message.type}\ndata: ${JSON.stringify(message)}\n\n`;
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' });
    response.write('retry: 100\n\n');
    latest.forEach((message) => { response.write(encode(message)); });
    clients.add(response);
    response.on('close', () => { clients.delete(response); });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Adresse du flux de test indisponible');
  return {
    url: `http://127.0.0.1:${address.port}/events`,
    send(message: Frame) {
      latest.set(message.type, message);
      clients.forEach((response) => { response.write(encode(message)); });
    },
    forget(type: string) { latest.delete(type); },
    disconnect() { clients.forEach((response) => { response.end(); }); },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error); });
        server.closeAllConnections();
      });
    },
  };
}

export const test = base.extend<{ stream: Awaited<ReturnType<typeof createTestStream>> }>({
  stream: async ({ baseURL }, run) => {
    const stream = await createTestStream(new URL(baseURL ?? 'http://localhost:4174').origin);
    try { await run(stream); } finally { await stream.close(); }
  },
});
export { expect };
