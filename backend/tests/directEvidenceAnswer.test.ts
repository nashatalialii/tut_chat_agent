import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectEvidenceAnswer } from '../src/rag/directEvidenceAnswer.js';
import { processLegalQuery } from '../src/rag/queryProcessor.js';
import type { RetrievedChunk } from '../src/rag/types.js';

function chunk(title: string, content: string): RetrievedChunk {
  return {
    chunkId: title,
    content,
    excerpt: content,
    source: title,
    keywordScore: 2,
    rerankScore: 0.9,
    metadata: {
      documentId: title,
      documentTitle: title,
      documentType: 'other',
      lawNumber: '66',
      lawYear: '1973',
      jurisdiction: 'Egypt',
      sourceName: 'ملخص المستخدم',
      language: 'ar',
      contentHash: title,
      sourceStatus: 'unverified',
      originalFilename: `${title}.md`
    }
  };
}

const speeding = chunk('تجاوز السرعة المقررة', `# تجاوز السرعة المقررة
معرف الموضوع: speeding
المادة المذكورة في الملخص: مادة 75.
العقوبة المذكورة: حبس حتى 6 أشهر + غرامة من 300 إلى 1500 جنيه أو إحدى العقوبتين.
العقوبة الإضافية: تتضاعف العقوبة عند العود خلال 6 أشهر.
إجابة مختصرة: حسب الملخص، تجاوز السرعة عقوبته حبس حتى 6 أشهر وغرامة من 300 إلى 1500 جنيه، أو إحدى العقوبتين، وتتضاعف عند العود خلال 6 أشهر.`);

const againstTraffic = chunk('السير عكس الاتجاه', `# السير عكس الاتجاه
معرف الموضوع: driving_against_traffic
المادة المذكورة في الملخص: مادة 76.
العقوبة المذكورة: حبس لا يقل عن سنة.
العقوبة الإضافية: إلغاء رخصة القيادة، ولا تمنح رخصة جديدة إلا بعد مدة مساوية لمدة الحبس المقضي بها.
إجابة مختصرة: حسب الملخص، السير عكس الاتجاه عقوبته حبس لا يقل عن سنة مع إلغاء رخصة القيادة.`);

test('returns deterministic short answer for an exact speeding penalty query', () => {
  const query = processLegalQuery('ما عقوبة تجاوز السرعة؟');
  const answer = buildDirectEvidenceAnswer(query, [speeding]);
  assert.equal(answer, 'حسب الملخص، تجاوز السرعة عقوبته حبس حتى 6 أشهر وغرامة من 300 إلى 1500 جنيه، أو إحدى العقوبتين، وتتضاعف عند العود خلال 6 أشهر.');
});

test('returns deterministic short answer for Egyptian Arabic consequence question', () => {
  const query = processLegalQuery('لو ماشي عكس الاتجاه يحصل إيه؟');
  const answer = buildDirectEvidenceAnswer(query, [againstTraffic]);
  assert.equal(answer, 'حسب الملخص، السير عكس الاتجاه عقوبته حبس لا يقل عن سنة مع إلغاء رخصة القيادة.');
});

test('does not answer from a different topic even if evidence exists', () => {
  const query = processLegalQuery('ما عقوبة تجاوز السرعة؟');
  const answer = buildDirectEvidenceAnswer(query, [againstTraffic]);
  assert.equal(answer, undefined);
});

test('license action uses only the explicit additional penalty field', () => {
  const history = [{ role: 'user' as const, content: 'لو ماشي عكس الاتجاه يحصل إيه؟' }];
  const query = processLegalQuery('الرخصة بتتسحب؟', history);
  const answer = buildDirectEvidenceAnswer(query, [againstTraffic]);
  assert.equal(answer, 'حسب الملخص، إلغاء رخصة القيادة، ولا تمنح رخصة جديدة إلا بعد مدة مساوية لمدة الحبس المقضي بها.');
});
