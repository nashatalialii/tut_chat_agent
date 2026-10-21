import { once } from 'node:events';
import { z } from 'zod';
import { adminProcedure, createTRPCRouter } from '../init.js';
import { uploadStore, type UploadProgress } from '../../uploads/upload.store.js';

async function* progressIterator(uploadId: string): AsyncGenerator<UploadProgress> {
  const current = await uploadStore.get(uploadId);
  if (current) yield current;
  while (true) {
    const [progress] = (await once(uploadStore.emitter, `upload:${uploadId}`)) as [UploadProgress];
    yield progress;
    if (['done', 'error', 'rejected'].includes(progress.status)) return;
  }
}

const MetadataSchema = z.object({
  document_title: z.string().min(2).max(300).optional(),
  document_type: z.enum(['law', 'regulation', 'amendment', 'decision', 'other']).default('other'),
  law_number: z.string().max(50).optional(),
  law_year: z.string().max(20).optional(),
  source_name: z.string().min(2).max(300),
  source_url: z.string().url().optional(),
  effective_from: z.string().max(40).optional(),
  effective_to: z.string().max(40).nullable().optional(),
  version: z.string().max(100).optional(),
  is_current: z.boolean().optional(),
  source_status: z.enum(['official', 'verified'])
});

export const uploadRouter = createTRPCRouter({
  create: adminProcedure
    .input(z.object({ filename: z.string().min(1).max(200), totalBytes: z.number().int().positive() }))
    .mutation(async ({ input }) => uploadStore.create(input.filename, input.totalBytes)),

  pushChunk: adminProcedure
    .input(z.object({ uploadId: z.string().min(1).max(100), base64: z.string().min(1).max(2_000_000) }))
    .mutation(async ({ input }) => uploadStore.pushChunk(input.uploadId, input.base64)),

  complete: adminProcedure
    .input(z.object({ uploadId: z.string().min(1).max(100) }))
    .mutation(async ({ input }) => uploadStore.complete(input.uploadId)),

  publish: adminProcedure
    .input(z.object({ uploadId: z.string().min(1).max(100), metadata: MetadataSchema }))
    .mutation(async ({ input }) => uploadStore.publish(input.uploadId, input.metadata)),

  reject: adminProcedure
    .input(z.object({ uploadId: z.string().min(1).max(100), reason: z.string().min(2).max(500) }))
    .mutation(async ({ input }) => uploadStore.reject(input.uploadId, input.reason)),

  list: adminProcedure.query(() => uploadStore.list()),

  progress: adminProcedure
    .input(z.object({ uploadId: z.string().min(1).max(100) }))
    .subscription(async function* ({ input }) { yield* progressIterator(input.uploadId); })
});
