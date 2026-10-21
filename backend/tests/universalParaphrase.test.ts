import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFaqIntent } from '../src/rag/faqIntentIndex.js';

const cases: Array<[string, string]> = [
  ['لو انا ماسك التلفون وانا سايق الغرامه كام؟', 'TRAF-074B-5'],
  ['انا سايق ومش لابس الحزام ادفع كام؟', 'TRAF-074B-3'],
  ['الرادار صورني وانا مزود السرعه عليا كام؟', 'TRAF-075-1'],
  ['العربيه فراملها بايظه العقوبه ايه؟', 'TRAF-075-5'],
  ['النمره مطموسه والرخصه تتسحب قد ايه؟', 'ADMIN-72-ج-1'],
  ['مفيش طفايه في العربيه الغرامه ايه؟', 'TRAF-074B-7'],
  ['شنطه الاسعافات مش موجوده يحصل ايه؟', 'TRAF-074B-9'],
  ['ماشي عكس السير ومفيش حادث العقوبه؟', 'TRAF-076-A'],
  ['خبطت واحد واتصاب اعمل ايه والعقوبه؟', 'ACC-02'],
  ['التاكسي مشغلش العداد مخالفته كام؟', 'TRAF-070'],
  ['الموتوسيكل من غير خوذه عليه كام؟', 'TRAF-074B-4'],
  ['فكيت كلبش المرور بنفسي يحصل ايه؟', 'TRAF-065BIS']
];

for (const [question, expectedReference] of cases) {
  test(`paraphrase maps to ${expectedReference}: ${question}`, async () => {
    const match = await matchFaqIntent(question);
    assert.ok(match, `No FAQ match for: ${question}`);
    assert.ok(match.references.includes(expectedReference), `${question} -> ${match.references.join(', ')}`);
  });
}
