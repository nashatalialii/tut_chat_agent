import { normalizeArabicQuery } from './normalize.js';
import {
  isAmbiguousSingleRetrievalToken,
  retrievalCharDice,
  retrievalTokenCoverage,
  retrievalTokenDice,
  retrievalTokens
} from './retrievalLexicon.js';
import type { RetrievedChunk } from './types.js';

const VIOLATION_TERMS: Record<string, string[]> = {
  driving_without_license: ['القيادة بدون رخصة قيادة', 'قياده بدون رخصه قياده', 'من غير رخصه قيادة', 'بدون رخصة قيادة'],
  vehicle_without_license: ['قيادة مركبة دون رخصة تسيير', 'بدون رخصه تسيير', 'من غير رخصه تسيير', 'العربيه مش مرخصه'],
  speeding: ['تجاوز السرعة', 'تجاوز السرعه', 'السرعة المقررة', 'السرعه المقرره', 'مخالفة السرعة', 'مخالفه السرعه'],
  driving_against_traffic: ['السير عكس الاتجاه', 'عكس الاتجاه', 'عكس الطريق', 'عكس السير'],
  driving_under_influence: ['القيادة تحت تأثير مخدر', 'القياده تحت تاثير مخدر', 'القيادة تحت تأثير خمر', 'قياده تحت تاثير مسكر', 'متعاطي'],
  invalid_or_mismatched_plates: ['اللوحات غير الصحيحة', 'اللوحات غير الخاصه بالمركبه', 'لوحات غير صحيحه', 'نمر مزوره', 'طمس اللوحات'],
  traffic_obstruction: ['تعطيل الطريق', 'اعاقة المرور', 'اعاقه المرور', 'تعطيل حركة المرور', 'تعطيل حركه المرور'],
  unauthorized_speed_bump: ['مطب صناعي بدون ترخيص', 'مطب بدون ترخيص', 'مطب عشوائي'],
  radar_detection_or_jamming_device: ['كشف الرادار', 'تعطيل الرادار', 'كاشف رادار', 'جهاز كشف الرادار'],
  road_pollution_noise_smoke: ['تلويث الطريق', 'الدخان الكثيف', 'الضوضاء', 'تساقط حمولة', 'تساقط حموله'],
  illegal_parking: ['انتظار خاطئ', 'الانتظار الخاطئ', 'ركنه غلط', 'واقف غلط', 'صف تاني'],
  mobile_phone: ['استخدام الهاتف', 'الهاتف', 'موبايل', 'الموبايل', 'تليفون', 'التليفون', 'تلفون', 'التلفون'],
  seat_belt: ['حزام الامان', 'عدم ربط الحزام', 'مش رابط الحزام', 'الحزام مخالفته', 'حزام الراكب الامامي']
};

export function meaningfulRecordTokens(text: string) {
  return retrievalTokens(text);
}

function inlineField(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^\\s*(?:\\*\\*)?${escaped}\\s*:\\s*(?:\\*\\*)?\\s*(.+?)\\s*$`, 'imu');
  return content.match(regex)?.[1]?.replace(/\*\*/g, '').trim();
}

function sectionBullets(content: string, heading: string) {
  const lines = content.split(/\r?\n/u);
  const normalizedHeading = normalizeArabicQuery(heading);
  let inside = false;
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s+/u.test(line)) {
      const title = line.replace(/^#{1,6}\s+/u, '').trim();
      if (inside) break;
      inside = normalizeArabicQuery(title) === normalizedHeading;
      continue;
    }
    if (inside && /^[-*]\s+/u.test(line)) out.push(line.replace(/^[-*]\s+/u, '').trim());
  }
  return out;
}

function candidateTexts(chunk: RetrievedChunk) {
  return [
    chunk.metadata.documentTitle ?? '',
    inlineField(chunk.content, 'الفئة') ?? '',
    inlineField(chunk.content, 'المخالفة') ?? '',
    inlineField(chunk.content, 'الحالة') ?? '',
    inlineField(chunk.content, 'كلمات الاسترجاع') ?? '',
    ...sectionBullets(chunk.content, 'صيغ أسئلة شائعة للاسترجاع'),
    ...sectionBullets(chunk.content, 'صيغ مطابقة موسعة')
  ].filter(Boolean);
}

export function recordQueryMatchScore(question: string, chunk: RetrievedChunk) {
  const normalizedQuestion = normalizeArabicQuery(question);
  const queryTokens = retrievalTokens(question);
  if (queryTokens.length === 0) return 0;
  if (queryTokens.length === 1 && isAmbiguousSingleRetrievalToken(queryTokens[0] ?? '')) return 0;

  let best = 0;
  for (const candidate of candidateTexts(chunk)) {
    const normalizedCandidate = normalizeArabicQuery(candidate);
    if (!normalizedCandidate) continue;

    if (normalizedCandidate === normalizedQuestion) best = Math.max(best, 1);
    if (normalizedQuestion.length >= 7 && normalizedCandidate.includes(normalizedQuestion)) best = Math.max(best, 0.98);
    if (normalizedCandidate.length >= 7 && normalizedQuestion.includes(normalizedCandidate)) best = Math.max(best, 0.96);

    const candidateTokens = retrievalTokens(candidate);
    const coverage = retrievalTokenCoverage(queryTokens, candidateTokens);
    const dice = retrievalTokenDice(queryTokens, candidateTokens);
    const chars = retrievalCharDice(queryTokens.join(' '), candidateTokens.join(' '));

    if (coverage === 1 && queryTokens.length >= 2) best = Math.max(best, 0.94, dice);
    else if (coverage === 1) best = Math.max(best, 0.82, dice);
    else best = Math.max(best, Math.min(0.93, dice * 0.52 + coverage * 0.33 + chars * 0.15));
  }
  return best;
}

function normalizedTerms(violationId: string) {
  return (VIOLATION_TERMS[violationId] ?? []).map(normalizeArabicQuery);
}

export function violationMatchScore(violationId: string | undefined, chunk: RetrievedChunk) {
  if (!violationId) return 0;
  const terms = normalizedTerms(violationId);
  if (terms.length === 0) return 0;

  const title = normalizeArabicQuery(chunk.metadata.documentTitle ?? '');
  if (terms.some((term) => title.includes(term))) return 1;

  const head = normalizeArabicQuery(chunk.content.slice(0, 1600));
  if (terms.some((term) => head.includes(term))) return 0.92;

  return 0;
}

export function hasStrongViolationMatch(violationId: string | undefined, chunk: RetrievedChunk) {
  return violationMatchScore(violationId, chunk) >= 0.9;
}

export function rankedDynamicRecordMatches(question: string, chunks: RetrievedChunk[]) {
  return chunks
    .map((chunk) => ({ chunk, score: recordQueryMatchScore(question, chunk) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.chunk.rerankScore ?? 0) - (a.chunk.rerankScore ?? 0);
    });
}

export function bestDynamicRecordMatches(question: string, chunks: RetrievedChunk[]) {
  const scored = rankedDynamicRecordMatches(question, chunks);
  const best = scored[0]?.score ?? 0;
  if (best < 0.58) return [];
  const floor = Math.max(0.58, best - 0.08);
  return scored.filter((item) => item.score >= floor).map((item) => item.chunk);
}

export function dominantDynamicRecord(question: string, chunks: RetrievedChunk[]) {
  const ranked = rankedDynamicRecordMatches(question, chunks);
  const first = ranked[0];
  const second = ranked[1];
  if (!first) return undefined;

  const secondScore = second?.score ?? 0;
  const margin = first.score - secondScore;
  if (first.score >= 0.88 && margin >= 0.04) return first.chunk;
  if (first.score >= 0.72 && margin >= 0.08) return first.chunk;
  if (first.score >= 0.58 && margin >= 0.13) return first.chunk;
  return undefined;
}
