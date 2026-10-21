import { z } from 'zod';
import { publicProcedure, createTRPCRouter } from '../init.js';
import { RagPipeline } from '../../rag/pipeline.js';
import { memoryService } from '../../memory/memory.service.js';
import { env } from '../../env.js';
import { logger } from '../../observability/logger.js';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(8000)
});

const ChatInputSchema = z.object({
  sessionId: z.string().min(1).max(128),
  question: z.string().trim().min(2).max(4000),
  history: z.array(MessageSchema).max(20).default([]),
  debug: z.boolean().optional()
});

export const chatRouter = createTRPCRouter({
  ask: publicProcedure.input(ChatInputSchema).mutation(async ({ input, ctx }) => {
    const rag = new RagPipeline(ctx.redis);
    const debug = Boolean(input.debug && env.RAG_DEBUG && ctx.user?.role === 'admin');
    logger.info('chat.ask', { request_id: ctx.requestId, session_id: ctx.sessionId, debug });
    return rag.answer({
      question: input.question,
      sessionId: ctx.sessionId,
      history: input.history,
      debug,
      requestId: ctx.requestId
    });
  }),

  stream: publicProcedure.input(ChatInputSchema).subscription(async function* ({ input, ctx, signal }) {
    const rag = new RagPipeline(ctx.redis);
    for await (const event of rag.streamAnswer({
      question: input.question,
      sessionId: ctx.sessionId,
      history: input.history,
      ...(signal ? { signal } : {}),
      requestId: ctx.requestId
    })) yield event;
  }),

  clearMemory: publicProcedure
    .input(z.object({ sessionId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx }) => {
      await memoryService.clear(ctx.redis, ctx.sessionId);
      return { ok: true };
    })
});
