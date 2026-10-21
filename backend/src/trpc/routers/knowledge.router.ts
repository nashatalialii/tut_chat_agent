import { createTRPCRouter, adminProcedure } from '../init.js';
import { readKnowledgeManifest } from '../../rag/knowledgeBase.js';
import { getKeywordIndexStats } from '../../rag/keywordIndex.js';
import { uploadStore } from '../../uploads/upload.store.js';

export const knowledgeRouter = createTRPCRouter({
  stats: adminProcedure.query(async () => {
    const [manifest, keyword, uploads] = await Promise.all([
      readKnowledgeManifest(),
      getKeywordIndexStats(),
      uploadStore.list()
    ]);
    return {
      knowledgeBaseVersion: manifest?.version ?? 'unversioned',
      generatedAt: manifest?.generatedAt ?? null,
      documents: manifest?.documents.length ?? 0,
      keywordChunks: keyword.chunks,
      pendingReview: uploads.filter((upload) => upload.status === 'pending_review').length,
      ingestionVersion: manifest?.ingestionVersion ?? null
    };
  })
});
