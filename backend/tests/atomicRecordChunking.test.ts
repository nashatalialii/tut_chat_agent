import assert from 'node:assert/strict';
import test from 'node:test';
import { Document } from '@langchain/core/documents';
import { chunkDocuments } from '../src/rag/chunker.js';

test('atomic RAG record remains one chunk even when longer than default chunk size', async () => {
  const longBody = 'تفصيل قانوني موثق. '.repeat(140);
  const doc = new Document({
    pageContent: `# سجل قانوني\n**معرف السجل:** TEST-ATOMIC\n**حالة السجل:** current_summary\n${longBody}\n## إجابة مختصرة\nإجابة محددة.`,
    metadata: {
      documentId: 'TEST-ATOMIC', documentTitle: 'سجل قانوني', documentType: 'other', jurisdiction: 'Egypt', sourceName: 'test',
      language: 'ar', contentHash: 'hash', sourceStatus: 'verified', originalFilename: 'test.md'
    }
  });
  const chunks = await chunkDocuments([doc]);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0]?.pageContent ?? '', /إجابة محددة/u);
});
