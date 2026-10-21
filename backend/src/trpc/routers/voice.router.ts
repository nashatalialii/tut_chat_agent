import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '../init.js';

export const voiceRouter = createTRPCRouter({
  createSession: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.redis.set(`voice:${input.sessionId}:state`, 'ready', 'EX', 60 * 30);
      return { ok: true, voiceWsPath: '/voice' };
    })
});
