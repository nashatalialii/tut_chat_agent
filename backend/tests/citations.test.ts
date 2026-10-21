import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLegalCitations } from '../src/rag/citations.js';
import type { RetrievedChunk } from '../src/rag/types.js';

const chunk: RetrievedChunk = {
  chunkId: 'c1',
  content: 'نص',
  excerpt: 'نص',
  source: 'الجريدة الرسمية',
  metadata: {
    documentId: 'law-66-1973',
    documentTitle: 'قانون المرور رقم 66 لسنة 1973',
    documentType: 'law',
    lawNumber: '66',
    lawYear: '1973',
    articleNumber: '72',
    jurisdiction: 'Egypt',
    sourceName: 'الجريدة الرسمية',
    pageNumber: 42,
    language: 'ar',
    contentHash: 'hash',
    chunkId: 'c1',
    sourceStatus: 'official',
    originalFilename: 'law.pdf'
  }
};

test('citations are constructed from retrieval metadata only', () => {
  const [citation] = buildLegalCitations([chunk]);
  assert.equal(citation?.articleNumber, '72');
  assert.equal(citation?.pageNumber, 42);
  assert.equal(citation?.sourceName, 'الجريدة الرسمية');
});
