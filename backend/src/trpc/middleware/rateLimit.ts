import { TRPCError } from '@trpc/server';
import type { Context } from '../context.js';
import { env } from '../../env.js';

export async function assertRateLimit(ctx: Context, path: string) {
  const identity = ctx.user?.id ?? ctx.sessionId ?? ctx.ip;
  const bucket = Math.floor(Date.now() / 1000 / env.RATE_LIMIT_WINDOW_SECONDS);
  const key = `rl:${identity}:${path}:${bucket}`;
  const count = await ctx.redis.incr(key);
  if (count === 1) await ctx.redis.expire(key, env.RATE_LIMIT_WINDOW_SECONDS + 5);

  if (count > env.RATE_LIMIT_MAX_REQUESTS) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'تم تجاوز الحد المسموح من الطلبات. جرّب مرة أخرى بعد دقيقة.'
    });
  }
}
