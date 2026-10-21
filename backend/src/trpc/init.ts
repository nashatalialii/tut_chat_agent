import { initTRPC } from '@trpc/server';
import type { Context } from './context.js';
import { assertRateLimit } from './middleware/rateLimit.js';
import { requireAdmin, requireUser } from './middleware/auth.js';

const t = initTRPC.context<Context>().create();

const rateLimited = t.middleware(async ({ ctx, path, next }) => {
  await assertRateLimit(ctx, path);
  return next({ ctx });
});

const authed = t.middleware(async ({ ctx, next }) => {
  const user = requireUser(ctx);
  return next({ ctx: { ...ctx, user } });
});

const adminOnly = t.middleware(async ({ ctx, next }) => {
  const user = requireAdmin(ctx);
  return next({ ctx: { ...ctx, user } });
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure.use(rateLimited);
export const protectedProcedure = t.procedure.use(rateLimited).use(authed);
export const adminProcedure = t.procedure.use(rateLimited).use(adminOnly);
