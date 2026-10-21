import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidence } from '../src/rag/evidenceValidator.js';
import { processLegalQuery } from '../src/rag/queryProcessor.js';
import type { RetrievedChunk } from '../src/rag/types.js';

function chunk(status: 'official' | 'verified' | 'unverified' | 'sample'): RetrievedChunk {
  return {
    chunkId: `c-${status}`, content: 'السير عكس الاتجاه', excerpt: 'السير عكس الاتجاه', source: 'source', keywordScore: 2, rerankScore: 0.8,
    metadata: {
      documentId: `d-${status}`, documentTitle: 'doc', documentType: 'law', jurisdiction: 'Egypt', sourceName: 'source',
      language: 'ar', contentHash: 'hash', sourceStatus: status, originalFilename: 'doc.txt'
    }
  };
}

test('strict evidence mode accepts verified evidence', () => {
  const result = validateEvidence(processLegalQuery('عقوبة السير عكس الاتجاه؟'), [chunk('verified')]);
  assert.equal(result.sufficient, true);
});
