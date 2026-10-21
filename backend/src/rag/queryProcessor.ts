import type { ChatMessage } from './types.js';
import { arabicDigitsToLatin, normalizeArabicQuery, tokenizeArabic } from './normalize.js';

export type LegalIntent =
  | 'penalty_lookup'
  | 'article_lookup'
  | 'license_action'
  | 'settlement_procedure'
  | 'legal_procedure'
  | 'general_legal_question';

export type QueryEntities = {
  violation?: string;
  articleNumber?: string;
  lawNumber?: string;
  lawYear?: string;
  requestedInformation: string[];
  jurisdiction: 'Egypt';
};

export type ProcessedQuery = {
  originalQuestion: string;
  normalizedQuery: string;
  retrievalQuery: string;
  intent: LegalIntent;
  entities: QueryEntities;
  keywords: string[];
  isFollowUp: boolean;
  preferCurrent: boolean;
};

const VIOLATIONS: Array<{ id: string; phrases: string[]; formal: string }> = [
  { id: 'driving_against_traffic', phrases: ['عكس الاتجاه', 'عكس اتجاه', 'ماشي عكس', 'السير عكس'], formal: 'السير عكس الاتجاه' },
  { id: 'speeding', phrases: ['تجاوز السرعه', 'تجاوز السرعة', 'السرعه المقرره', 'السرعة المقررة', 'سرعه زايده', 'مخالفة السرعه', 'مخالفة السرعة', 'الرادار صورني'], formal: 'تجاوز السرعة المقررة' },
  { id: 'driving_without_license', phrases: ['بدون رخصه قياده', 'من غير رخصه قياده', 'من غير رخصه سواقه', 'قياده بدون رخصه', 'القيادة بدون رخصة', 'رخصه السواقه'], formal: 'القيادة بدون رخصة قيادة' },
  { id: 'vehicle_without_license', phrases: ['بدون رخصه تسيير', 'من غير رخصه تسيير', 'العربيه مش مرخصه', 'المركبه مش مرخصه', 'بدون ترخيص للعربيه'], formal: 'قيادة مركبة دون رخصة تسيير' },
  { id: 'driving_under_influence', phrases: ['تحت تاثير مخدر', 'تحت تأثير مخدر', 'متعاطي', 'مخدرات', 'تحت تاثير خمر', 'تحت تأثير خمر', 'مسكر'], formal: 'القيادة تحت تأثير مخدر أو خمر' },
  { id: 'invalid_or_mismatched_plates', phrases: ['لوحات غير صحيحه', 'لوحات غير صحيحة', 'نمر مزوره', 'نمر مزورة', 'طمس اللوحات', 'لوحه مش بتاعتها', 'لوحة مش بتاعتها'], formal: 'اللوحات غير الصحيحة أو غير الخاصة بالمركبة' },
  { id: 'traffic_obstruction', phrases: ['تعطيل الطريق', 'اعاقه المرور', 'إعاقة المرور', 'اعاقة المرور', 'تعطيل حركه المرور', 'غلق الطريق'], formal: 'تعطيل الطريق أو إعاقة المرور بدون سبب' },
  { id: 'unauthorized_speed_bump', phrases: ['مطب صناعي', 'مطب بدون ترخيص', 'مطب من غير ترخيص'], formal: 'مطب صناعي بدون ترخيص' },
  { id: 'radar_detection_or_jamming_device', phrases: ['كاشف رادار', 'كشف الرادار', 'تعطيل الرادار', 'جهاز كشف الرادار', 'جهاز يعطل الرادار'], formal: 'استخدام أجهزة كشف أو تعطيل الرادار' },
  { id: 'road_pollution_noise_smoke', phrases: ['تلويث الطريق', 'دخان كثيف', 'عادم', 'ضوضاء', 'تساقط حموله', 'تساقط حمولة'], formal: 'تلويث الطريق أو الضوضاء أو الدخان الكثيف' },
  { id: 'illegal_parking', phrases: ['انتظار خاطئ', 'الانتظار الخاطئ', 'ركنه غلط', 'واقف غلط', 'صف تاني'], formal: 'الوقوف أو الانتظار المخالف' },
  { id: 'mobile_phone', phrases: ['الموبايل', 'موبايل', 'الهاتف', 'هاتف', 'التليفون', 'تليفون', 'التلفون', 'تلفون', 'ماسك الموبايل', 'ماسك التليفون', 'ماسك التلفون', 'مسكت الموبايل', 'مسكت التليفون', 'مسكت التلفون', 'الموبايل في ايدي', 'التليفون في ايدي', 'التلفون في ايدي', 'بكلم في الموبايل', 'بكلم في التليفون', 'بكلم في التلفون', 'تليفون اثناء القياده'], formal: 'استخدام الهاتف يدويًا أثناء القيادة' },
  { id: 'seat_belt', phrases: ['حزام الامان', 'الحزام'], formal: 'عدم استخدام حزام الأمان' }
];

function extractArticleNumber(text: string) {
  const latin = arabicDigitsToLatin(text);
  return latin.match(/(?:الماده|المادة|ماده|مادة)\s*\(?\s*(\d{1,4}(?:\s*(?:مكرر|مكررا))?)\s*\)?/u)?.[1];
}

function extractLawIdentity(text: string) {
  const latin = arabicDigitsToLatin(text);
  const match = latin.match(/(?:قانون[^\n]{0,60}?)?رقم\s*\(?\s*(\d{1,4})\s*\)?\s*(?:لسنه|لسنة)\s*(\d{4})/u);
  return match ? { lawNumber: match[1], lawYear: match[2] } : {};
}

function previousUserQuestion(history: ChatMessage[]) {
  return [...history].reverse().find((message) => message.role === 'user')?.content;
}

function looksLikeFollowUp(normalized: string) {
  const tokens = tokenizeArabic(normalized);
  return tokens.length <= 4 || /^(عليه|عليها|دي|ده|الماده دي|المادة دي|الرخصه|الرخصة|ينفع)/u.test(normalized);
}

function detectIntent(normalized: string, articleNumber?: string): LegalIntent {
  if (articleNumber || /الماده|المادة/u.test(normalized)) return 'article_lookup';
  if (/الرخصه|الرخصة|سحب|ايقاف|وقف الرخص/u.test(normalized)) return 'license_action';
  if (/تصالح|التصالح/u.test(normalized)) return 'settlement_procedure';
  if (/غرامه|غرامة|عقوبه|عقوبة|حبس|كام|جزاء/u.test(normalized)) return 'penalty_lookup';
  if (/اجراء|إجراء|اعمل ايه|يتعمل/u.test(normalized)) return 'legal_procedure';
  return 'general_legal_question';
}

export function processLegalQuery(question: string, history: ChatMessage[] = []): ProcessedQuery {
  const normalizedQuery = normalizeArabicQuery(question);
  const isFollowUp = looksLikeFollowUp(normalizedQuery);
  const preferCurrent = !/(قبل التعديل|النسخه القديمه|النسخة القديمة|تاريخيا|تاريخيًا|سابقا|سابقًا|وقت صدور)/u.test(normalizedQuery);
  const prior = isFollowUp ? previousUserQuestion(history) : undefined;
  const contextualText = prior ? `${question} ${prior}` : question;
  const contextualNormalized = normalizeArabicQuery(contextualText);

  const articleNumber = extractArticleNumber(contextualText);
  const law = extractLawIdentity(contextualText);
  const matchedViolation = VIOLATIONS.find((entry) => entry.phrases.some((phrase) => contextualNormalized.includes(normalizeArabicQuery(phrase))));
  const intent = detectIntent(normalizedQuery, articleNumber);

  const requestedInformation: string[] = [];
  if (/غرامه|غرامة|كام|عقوبه|عقوبة|حبس|جزاء/u.test(normalizedQuery)) requestedInformation.push('penalty');
  if (/رخصه|رخصة|سحب|ايقاف|إيقاف/u.test(normalizedQuery)) requestedInformation.push('license_action');
  if (/تصالح|التصالح/u.test(normalizedQuery)) requestedInformation.push('settlement');
  if (articleNumber) requestedInformation.push('article_text');
  if (requestedInformation.length === 0) requestedInformation.push('legal_explanation');

  const entities: QueryEntities = {
    ...(matchedViolation ? { violation: matchedViolation.id } : {}),
    ...(articleNumber ? { articleNumber } : {}),
    ...(law.lawNumber ? { lawNumber: law.lawNumber } : {}),
    ...(law.lawYear ? { lawYear: law.lawYear } : {}),
    requestedInformation,
    jurisdiction: 'Egypt'
  };

  const formalParts: string[] = [];
  if (matchedViolation) formalParts.push(matchedViolation.formal);
  if (articleNumber) formalParts.push(`المادة ${articleNumber}`);
  if (law.lawNumber && law.lawYear) formalParts.push(`القانون رقم ${law.lawNumber} لسنة ${law.lawYear}`);

  if (intent === 'penalty_lookup') formalParts.push('العقوبة القانونية والغرامة إن وردت بالنص');
  if (intent === 'license_action') formalParts.push('أثر المخالفة على الرخصة إن ورد بالنص');
  if (intent === 'settlement_procedure') formalParts.push('إمكانية التصالح وإجراءاته إن وردت بالنص');
  if (intent === 'article_lookup') formalParts.push('النص القانوني وموضوع المادة');

  const retrievalQuery = formalParts.length > 0
    ? `${formalParts.join('، ')}. السؤال الأصلي: ${question}${prior ? `. سياق السؤال السابق: ${prior}` : ''}`
    : `${question}${prior ? `\nسياق السؤال السابق: ${prior}` : ''}`;

  const keywords = Array.from(new Set([
    ...tokenizeArabic(retrievalQuery),
    ...(articleNumber ? [articleNumber] : []),
    ...(law.lawNumber ? [law.lawNumber] : []),
    ...(law.lawYear ? [law.lawYear] : [])
  ])).slice(0, 24);

  return { originalQuestion: question, normalizedQuery, retrievalQuery, intent, entities, keywords, isFollowUp, preferCurrent };
}
