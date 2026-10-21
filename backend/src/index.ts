import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import * as trpcExpress from '@trpc/server/adapters/express';
import { applyWSSHandler } from '@trpc/server/adapters/ws';
import { WebSocketServer } from 'ws';

import { env } from './env.js';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { createVoiceGateway } from './voice/voiceGateway.js';
import { redis } from './redis/client.js';
import { logger } from './observability/logger.js';

const app = express();

app.use((req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming)?.slice(0, 128) || crypto.randomUUID();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  logger.info('http.request', { request_id: requestId, method: req.method, path: req.path });
  next();
});

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-session-id', 'x-request-id']
  })
);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get('/voice-healthz', (_req, res) => {
  res.json({ ok: true, websocketPath: '/voice', ts: new Date().toISOString() });
});

app.get('/readyz', async (_req, res) => {
  const checks = { redis: false, ollama: false, chroma: false };
  try { checks.redis = (await redis.ping()) === 'PONG'; } catch { /* reported below */ }
  try {
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    checks.ollama = response.ok;
  } catch { /* reported below */ }
  try {
    const response = await fetch(env.CHROMA_URL, { signal: AbortSignal.timeout(2000) });
    checks.chroma = response.status < 500;
  } catch { /* reported below */ }
  const ok = Object.values(checks).every(Boolean);
  res.status(ok ? 200 : 503).json({ ok, checks, ts: new Date().toISOString() });
});

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({ router: appRouter, createContext })
);

const server = http.createServer(app);

// IMPORTANT: tRPC and voice share the same HTTP server/port. With `ws`, the
// robust way to host multiple WebSocket endpoints is `noServer: true` plus one
// explicit HTTP upgrade router. This prevents one WebSocketServer from
// rejecting an upgrade intended for the other endpoint.
const trpcWss = new WebSocketServer({ noServer: true });
const voiceWss = createVoiceGateway();
const handler = applyWSSHandler({ wss: trpcWss, router: appRouter, createContext });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

  if (pathname === '/trpc') {
    trpcWss.handleUpgrade(request, socket, head, (ws) => {
      trpcWss.emit('connection', ws, request);
    });
    return;
  }

  if (pathname === '/voice') {
    voiceWss.handleUpgrade(request, socket, head, (ws) => {
      voiceWss.emit('connection', ws, request);
    });
    return;
  }

  logger.warn('websocket.unknown_path', { path: pathname });
  socket.destroy();
});

trpcWss.on('error', (error) => logger.error('websocket.trpc_error', { error: error.message }));
voiceWss.on('error', (error) => logger.error('websocket.voice_server_error', { error: error.message }));

server.listen(env.BACKEND_PORT, () => {
  logger.info('backend.started', { port: env.BACKEND_PORT, voice_ws_path: '/voice', trpc_ws_path: '/trpc' });
});

process.on('SIGTERM', () => {
  logger.info('backend.sigterm');
  handler.broadcastReconnectNotification();
  for (const client of voiceWss.clients) client.close(1001, 'server shutdown');
  voiceWss.close();
  trpcWss.close();
  server.close(() => process.exit(0));
});
