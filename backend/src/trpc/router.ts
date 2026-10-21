import { createTRPCRouter } from './init.js';
import { chatRouter } from './routers/chat.router.js';
import { uploadRouter } from './routers/upload.router.js';
import { voiceRouter } from './routers/voice.router.js';
import { healthRouter } from './routers/health.router.js';
import { knowledgeRouter } from './routers/knowledge.router.js';

export const appRouter = createTRPCRouter({
  health: healthRouter,
  chat: chatRouter,
  upload: uploadRouter,
  voice: voiceRouter,
  knowledge: knowledgeRouter
});

export type AppRouter = typeof appRouter;
