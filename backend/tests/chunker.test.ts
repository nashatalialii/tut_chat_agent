import assert from 'node:assert/strict';
import test from 'node:test';
import { Document } from '@langchain/core/documents';
import { chunkDocuments } from '../src/rag/chunker.js';

test('legal chunker preserves article numbers and original/normalized text', async () => {
  const doc = new Document({
    pageContent: 'الباب الأول\nالمادة ٧٢: نص المادة الأولى.\nفقرة تكميلية.\nالمادة ٧٣: نص المادة التالية.',
    metadata: {
      documentId: 'd1', documentTitle: 'اختبار', documentType: 'law', jurisdiction: 'Egypt', sourceName: 'اختبار',
      language: 'ar', contentHash: 'hash', sourceStatus: 'verified', originalFilename: 'test.txt', pageNumber: 1
    }
  });
  const chunks = await chunkDocuments([doc]);
  const articles = chunks.map((item) => item.metadata.articleNumber).filter(Boolean);
  assert.ok(articles.includes('72'));
  assert.ok(articles.includes('73'));
  assert.ok(chunks.every((item) => typeof item.metadata.originalText === 'string'));
  assert.ok(chunks.every((item) => typeof item.metadata.normalizedText === 'string'));
});
