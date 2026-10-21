import assert from 'node:assert/strict';
import test from 'node:test';
import { processLegalQuery } from '../src/rag/queryProcessor.js';

test('extracts article number from Arabic digits', () => {
  const result = processLegalQuery('المادة ٧٢ بتقول ايه؟');
  assert.equal(result.entities.articleNumber, '72');
  assert.equal(result.intent, 'article_lookup');
});

test('understands Egyptian wrong-way penalty query', () => {
  const result = processLegalQuery('هو لو واحد ماشي عكس الاتجاه هيتعمله ايه؟');
  assert.equal(result.entities.violation, 'driving_against_traffic');
  assert.match(result.retrievalQuery, /السير عكس الاتجاه/);
});

test('uses prior user question only to contextualize a short follow-up', () => {
  const result = processLegalQuery('عليه كام؟', [
    { role: 'user', content: 'مخالفة السرعة' },
    { role: 'assistant', content: 'نص سابق غير موثوق للاختبار' }
  ]);
  assert.equal(result.isFollowUp, true);
  assert.match(result.retrievalQuery, /مخالفة السرعة/);
  assert.doesNotMatch(result.retrievalQuery, /غير موثوق/);
});
