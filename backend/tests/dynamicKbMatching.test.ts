import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectEvidenceAnswer } from '../src/rag/directEvidenceAnswer.js';
import { bestDynamicRecordMatches, recordQueryMatchScore } from '../src/rag/topicMatcher.js';
import { processLegalQuery } from '../src/rag/queryProcessor.js';
import type { RetrievedChunk } from '../src/rag/types.js';

function chunk(id: string, title: string, content: string): RetrievedChunk {
  return {
    chunkId: id,
    content,
    excerpt: content,
    source: `${id}.md`,
    keywordScore: 2,
    rerankScore: 0.9,
    metadata: {
      documentId: id,
      documentTitle: title,
      documentType: 'other',
      lawNumber: '66',
      lawYear: '1973',
      jurisdiction: 'Egypt',
      sourceName: 'verified source',
      language: 'ar',
      contentHash: id,
      sourceStatus: 'verified',
      originalFilename: `${id}.md`
    }
  };
}

const seatbelt = chunk('TRAF-074B-3', 'عدم استخدام السائق أو الراكب الأمامي حزام الأمان', `# عدم استخدام السائق أو الراكب الأمامي حزام الأمان
**معرف السجل:** TRAF-074B-3
**حالة السجل:** current_summary
**المادة/المرجع:** مادة 74 مكررا/3
## المحتوى القانوني أو الإرشادي المعتمد داخل النظام
**الفئة:** حزام الأمان
**المخالفة:** عدم استخدام السائق أو الراكب الأمامي حزام الأمان.
**الغرامة:** من 100 إلى 300 جنيه
**الحبس:** —
**العود/التكرار:** تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.
## إجابة مختصرة
الغرامة: من 100 إلى 300 جنيه؛ العود: تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.
## صيغ أسئلة شائعة للاسترجاع
- عدم ربط حزام الأمان غرامته كام؟
- الحزام مخالفته بكام؟
- هل السواق بيتحاسب لو اللي جنبه مش رابط الحزام؟`);

const speeding = chunk('TRAF-075-1', 'تجاوز الحد الأقصى للسرعة المقررة', `# تجاوز الحد الأقصى للسرعة المقررة
**معرف السجل:** TRAF-075-1
**حالة السجل:** current_summary
## المحتوى القانوني أو الإرشادي المعتمد داخل النظام
**الفئة:** سرعة زائدة
**المخالفة:** تجاوز الحد الأقصى للسرعة المقررة.
## إجابة مختصرة
الغرامة: من 300 إلى 1,500 جنيه؛ الحبس: حبس حتى 6 أشهر، أو إحدى العقوبتين.
## صيغ أسئلة شائعة للاسترجاع
- غرامة السرعة الزائدة كام؟
- لو الرادار صورني سرعة أدفع كام؟`);

test('dynamic KB matcher selects seatbelt record from Egyptian Arabic wording', () => {
  const q = 'لو مش رابط الحزام الغرامة كام؟';
  assert.ok(recordQueryMatchScore(q, seatbelt) >= 0.72);
  assert.ok(recordQueryMatchScore(q, seatbelt) > recordQueryMatchScore(q, speeding));
  assert.deepEqual(bestDynamicRecordMatches(q, [speeding, seatbelt]).map((item) => item.metadata.documentId), ['TRAF-074B-3']);
});

test('direct answer reads verified KB markdown section', () => {
  const processed = processLegalQuery('لو مش رابط الحزام الغرامة كام؟');
  const answer = buildDirectEvidenceAnswer(processed, [seatbelt, speeding]);
  assert.equal(answer, 'الغرامة: من 100 إلى 300 جنيه؛ العود: تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.');
});

test('ambiguous one-token licence follow-up is not dynamically guessed', () => {
  assert.equal(recordQueryMatchScore('الرخصة؟', seatbelt), 0);
});
