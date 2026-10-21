import assert from 'node:assert/strict';
import test from 'node:test';
import { arabicDigitsToLatin, normalizeArabicQuery, tokenizeArabic } from '../src/rag/normalize.js';

test('normalizes Arabic variants without modifying the caller input', () => {
  const input = 'إشارة آمنة على طريقٍ سريع';
  const normalized = normalizeArabicQuery(input);
  assert.equal(input, 'إشارة آمنة على طريقٍ سريع');
  assert.match(normalized, /اشاره امنه/);
});

test('converts Arabic digits for exact legal-number retrieval', () => {
  assert.equal(arabicDigitsToLatin('المادة ٧٢ والقانون ٦٦'), 'المادة 72 والقانون 66');
  assert.ok(tokenizeArabic('المادة ٧٢').includes('72'));
});
