import assert from 'node:assert/strict';
import test from 'node:test';
import { reciprocalRankFusion } from '../src/rag/fusion.js';
import type { RetrievedChunk } from '../src/rag/types.js';

const metadata = {
  documentId: 'd1', documentTitle: 'doc', documentType: 'law' as const, jurisdiction: 'Egypt' as const,
  sourceName: 'source', language: 'ar' as const, contentHash: 'hash', sourceStatus: 'verified' as const, originalFilename: 'doc.txt'
};
const chunk = (id: string): RetrievedChunk => ({ chunkId: id, content: id, excerpt: id, source: 'source', metadata: { ...metadata, chunkId: id } });

test('RRF rewards chunks present in both retrieval lists', () => {
  const a = chunk('a'); const b = chunk('b'); const c = chunk('c');
  const fused = reciprocalRankFusion([a, b], [c, a], 60);
  assert.equal(fused[0]?.chunkId, 'a');
});
