import crypto from 'node:crypto';
import type * as trpcExpress from '@trpc/server/adapters/express';
import type { CreateWSSContextFnOptions } from '@trpc/server/adapters/ws';
import { redis } from '../redis/client.js';
import { env } from '../env.js';

export type User = {
  id: string;
  role: 'user' | 'admin';
};

function getHeader(req: { headers?: Record<string, string | string[] | undefined> } | undefined, name: string) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function readUserFromAuthHeader(authHeader?: string): User | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;
  if (env.ADMIN_API_TOKEN && safeEqual(token, env.ADMIN_API_TOKEN)) return { id: 'api:admin', role: 'admin' };
  if (env.USER_API_TOKEN && safeEqual(token, env.USER_API_TOKEN)) return { id: 'api:user', role: 'user' };
  return null;
}

export async function createContext(
  opts?: trpcExpress.CreateExpressContextOptions | CreateWSSContextFnOptions
) {
  const req = opts && 'req' in opts ? opts.req : undefined;
  const ip = getHeader(req, 'x-forwarded-for')?.split(',')[0]?.trim() || req?.socket?.remoteAddress || 'unknown';
  const rawSession = getHeader(req, 'x-session-id');
  const sessionId = rawSession && /^[a-zA-Z0-9:_-]{1,128}$/.test(rawSession) ? rawSession : `anon:${ip}`;
  const user = readUserFromAuthHeader(getHeader(req, 'authorization'));
  const requestId = getHeader(req, 'x-request-id')?.slice(0, 128) || crypto.randomUUID();

  return { redis, ip, sessionId, user, requestId };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
