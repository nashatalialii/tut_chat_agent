import { createTRPCRouter, publicProcedure } from '../init.js';

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(async ({ ctx }) => {
    const redisPong = await ctx.redis.ping();
    return {
      ok: true,
      redis: redisPong,
      now: new Date().toISOString()
    };
  })
});
