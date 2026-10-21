import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidence } from '../src/rag/evidenceValidator.js';
import { processLegalQuery } from '../src/rag/queryProcessor.js';
import type { RetrievedChunk } from '../src/rag/types.js';

function chunk(title: string, content: string): RetrievedChunk {
  return {
    chunkId: title,
    content,
    excerpt: content,
    source: title,
    keywordScore: 2,
    rerankScore: 0.8,
    metadata: {
      documentId: title,
      documentTitle: title,
      documentType: 'other',
      lawNumber: '66',
      lawYear: '1973',
      jurisdiction: 'Egypt',
      sourceName: title,
      language: 'ar',
      contentHash: title,
      sourceStatus: 'unverified',
      originalFilename: `${title}.md`
    }
  };
}

test('speeding query excludes unrelated obstruction evidence when exact topic exists', () => {
  const query = processLegalQuery('ما عقوبة تجاوز السرعة؟');
  const speeding = chunk('تجاوز السرعة المقررة', '# تجاوز السرعة المقررة\nالعقوبة: غرامة...');
  const obstruction = chunk('تعطيل الطريق أو إعاقة المرور بدون سبب', '# تعطيل الطريق\nالعقوبة: غرامة...');
  const result = validateEvidence(query, [speeding, obstruction]);
  assert.equal(result.sufficient, true);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.metadata.documentTitle, 'تجاوز السرعة المقررة');
});
