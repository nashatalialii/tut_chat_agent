import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectEvidenceAnswer } from '../src/rag/directEvidenceAnswer.js';
import { validateEvidence } from '../src/rag/evidenceValidator.js';
import { processLegalQuery } from '../src/rag/queryProcessor.js';
import { recordQueryMatchScore } from '../src/rag/topicMatcher.js';
import type { RetrievedChunk } from '../src/rag/types.js';

function chunk(id: string, title: string, content: string, rerankScore = 0.8): RetrievedChunk {
  return {
    chunkId: id,
    content,
    excerpt: content,
    source: `${id}.md`,
    keywordScore: 1,
    rerankScore,
    metadata: {
      documentId: id,
      documentTitle: title,
      documentType: 'other',
      lawNumber: '66',
      lawYear: '1973',
      jurisdiction: 'Egypt',
      sourceName: 'verified consolidated text',
      language: 'ar',
      contentHash: id,
      sourceStatus: 'verified',
      originalFilename: `${id}.md`
    }
  };
}

const phone = chunk('TRAF-074B-5', 'استخدام الهاتف يدويًا أثناء القيادة', `# استخدام الهاتف يدويًا أثناء القيادة
**معرف السجل:** TRAF-074B-5
**حالة السجل:** current_summary
**المادة/المرجع:** مادة 74 مكررا/5
## المحتوى القانوني أو الإرشادي المعتمد داخل النظام
**الفئة:** هاتف محمول
**المخالفة:** استخدام الهاتف يدويًا أثناء القيادة.
**الغرامة:** من 100 إلى 300 جنيه
**الحبس:** —
**إجراء إضافي:** —
**العود/التكرار:** تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.
## إجابة مختصرة
الغرامة: من 100 إلى 300 جنيه؛ العود: تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.
## صيغ أسئلة شائعة للاسترجاع
- غرامة استخدام الموبايل أثناء السواقة كام؟
- مسكت الموبايل وأنا سايق، المخالفة كام؟
- الهاند فري عليه مخالفة؟`);

const wrongWay = chunk('TRAF-076-A', 'القيادة تحت تأثير مخدر أو مسكر، أو السير عكس الاتجاه', `# القيادة تحت تأثير مخدر أو مسكر، أو السير عكس الاتجاه
**حالة السجل:** requires_case_assessment
## المحتوى القانوني أو الإرشادي المعتمد داخل النظام
**الفئة:** مخدر/مسكر أو عكس الاتجاه
**المخالفة:** قيادة مركبة تحت تأثير مخدر أو مسكر، أو السير عكس الاتجاه.
## إجابة مختصرة
حبس لا يقل عن سنة مع إلغاء رخصة القيادة.` , 0.72);

const speeding = chunk('TRAF-075-1', 'تجاوز الحد الأقصى للسرعة المقررة', `# تجاوز الحد الأقصى للسرعة المقررة
**حالة السجل:** current_summary
**الفئة:** سرعة زائدة
**المخالفة:** تجاوز الحد الأقصى للسرعة المقررة.
## إجابة مختصرة
الغرامة من 300 إلى 1500 جنيه.` , 0.70);

const variants = [
  'لو انا ماسك التلفون وانا سايق الغرامه كام؟',
  'لو أنا ماسك التليفون وأنا سايق الغرامة كام؟',
  'التليفون في ايدي وانا بسوق عليه كام؟',
  'مسكت الموبايل وأنا سايق المخالفة كام؟'
];

for (const question of variants) {
  test(`phone paraphrase stays on phone topic: ${question}`, () => {
    const processed = processLegalQuery(question);
    assert.equal(processed.entities.violation, 'mobile_phone');
    assert.ok(recordQueryMatchScore(question, phone) >= 0.78);
    assert.ok(recordQueryMatchScore(question, phone) > recordQueryMatchScore(question, wrongWay));

    const validation = validateEvidence(processed, [phone, wrongWay, speeding]);
    assert.equal(validation.sufficient, true);
    assert.deepEqual(validation.evidence.map((item) => item.metadata.documentId), ['TRAF-074B-5']);

    const answer = buildDirectEvidenceAnswer(processed, validation.evidence);
    assert.equal(answer, 'الغرامة: من 100 إلى 300 جنيه؛ العود: تضاعف الغرامة عند التكرار خلال 6 أشهر من الحكم النهائي.');
  });
}

test('wrong-way wording is not stolen by phone aliases', () => {
  const question = 'لو ماشي عكس الاتجاه يحصل إيه؟';
  const processed = processLegalQuery(question);
  assert.equal(processed.entities.violation, 'driving_against_traffic');
  assert.ok(recordQueryMatchScore(question, wrongWay) > recordQueryMatchScore(question, phone));
});
