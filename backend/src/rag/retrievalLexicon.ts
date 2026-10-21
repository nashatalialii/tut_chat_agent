import { normalizeArabicQuery, tokenizeArabic } from './normalize.js';

const TOKEN_ALIASES: Record<string, string> = {
  موبايل: 'هاتف', تلفون: 'هاتف', تليفون: 'هاتف', هاتف: 'هاتف', محمول: 'هاتف',
  عربيه: 'مركبه', سياره: 'مركبه', سيارة: 'مركبه', مركبه: 'مركبه',
  سايق: 'سائق', سواق: 'سائق', سائق: 'سائق', قائد: 'سائق',
  سواقه: 'قياده', بسوق: 'قياده', باسوق: 'قياده', قياده: 'قياده',
  رخصه: 'رخصه', رخصة: 'رخصه', ترخيص: 'رخصه',
  نمره: 'لوحه', نمر: 'لوحه', لوحات: 'لوحه', لوحه: 'لوحه',
  موتوسيكل: 'دراجه', موتسيكل: 'دراجه', دراجه: 'دراجه',
  كلاكس: 'تنبيه', زمور: 'تنبيه',
  استيكر: 'ملصق', ملصق: 'ملصق',
  طفايه: 'اطفاء', طفاية: 'اطفاء', اطفاء: 'اطفاء',
  شنطه: 'حقيبه', شنطة: 'حقيبه', حقيبه: 'حقيبه', حقيبة: 'حقيبه',
  كلبش: 'قفل', كلبشه: 'قفل',
  حادثه: 'حادث', حادثة: 'حادث', خبطت: 'حادث', خبط: 'حادث',
  اتصاب: 'اصابه', اصيب: 'اصابه', مصاب: 'اصابه', اصابه: 'اصابه',
  مات: 'وفاه', توفي: 'وفاه', وفاة: 'وفاه', وفاه: 'وفاه',
  مخدرات: 'مخدر', متعاطي: 'مخدر', مخمور: 'مسكر', خمر: 'مسكر',
  ماسك: 'مسك', مسكت: 'مسك', بمسك: 'مسك',
  رابط: 'ربط', ربطت: 'ربط', ربط: 'ربط',
  لابس: 'ربط', لبست: 'ربط', لبس: 'ربط',
  مشغل: 'تشغيل', شغلت: 'تشغيل',
  واقف: 'توقف', وقفت: 'توقف',
  ماشي: 'سير', مشيت: 'سير', سير: 'سير',
  عديت: 'تجاوز', عدي: 'تجاوز',
  ضاعت: 'فاقد', ضايعه: 'فاقد', ضايعة: 'فاقد',
  باظت: 'تالف', تالفة: 'تالف',
  حمرا: 'حمراء',
  فراملها: 'فرامل', فرامل: 'فرامل',
  تتسحب: 'سحب', تسحب: 'سحب', اتسحبت: 'سحب', سحب: 'سحب',
  فكيت: 'فك', فكيته: 'فك', فك: 'فك',
};

const GENERIC_QUERY_WORDS = new Set([
  'غرامه', 'الغرامه', 'غرامته', 'عقوبه', 'العقوبه', 'عقوبته', 'مخالفه', 'المخالفه', 'مخالفته',
  'كام', 'بكام', 'ايه', 'اي', 'يحصل', 'حصل', 'عليه', 'عليها', 'فيه', 'فيها', 'ينفع', 'ممكن',
  'انا', 'هو', 'هي', 'واحد', 'واحده', 'وانا', 'وهو', 'وهي', 'وقت', 'اثناء', 'قانون', 'ماده',
  'اعمل', 'اعملها', 'ازاي', 'فين', 'منين', 'قدامي', 'قد', 'جنيه', 'حبس', 'جزاء', 'المبلغ', 'ادفع',
  'مش', 'مفيش', 'بنفسي', 'استخدام', 'استعمال', 'حاله', 'حالة'
]);

const AMBIGUOUS_SINGLE_TOKENS = new Set([
  'رخصه', 'مركبه', 'مرور', 'طريق', 'لوحه', 'قياده', 'استخدام', 'سحب'
]);

function stripArticlePrefix(value: string) {
  if (value.startsWith('وال') && value.length > 5) return value.slice(3);
  if (value.startsWith('بال') && value.length > 5) return value.slice(3);
  if (value.startsWith('فال') && value.length > 5) return value.slice(3);
  if (value.startsWith('لل') && value.length > 4) return value.slice(2);
  if (value.startsWith('ال') && value.length > 4) return value.slice(2);
  return value;
}

export function canonicalRetrievalToken(raw: string) {
  const normalized = normalizeArabicQuery(raw);
  const stripped = stripArticlePrefix(normalized);
  return TOKEN_ALIASES[stripped] ?? stripped;
}

export function retrievalTokens(text: string) {
  return tokenizeArabic(text)
    .map(canonicalRetrievalToken)
    .filter((token) => token.length > 1 && !GENERIC_QUERY_WORDS.has(token));
}

export function isAmbiguousSingleRetrievalToken(token: string) {
  return AMBIGUOUS_SINGLE_TOKENS.has(token);
}

export function retrievalTokenEquivalent(a: string, b: string) {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return false;
}

export function retrievalTokenDice(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const remaining = [...b];
  let hits = 0;
  for (const left of a) {
    const index = remaining.findIndex((right) => retrievalTokenEquivalent(left, right));
    if (index >= 0) {
      hits += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * hits) / (a.length + b.length);
}

export function retrievalTokenCoverage(queryTokens: string[], candidateTokens: string[]) {
  if (queryTokens.length === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (candidateTokens.some((candidate) => retrievalTokenEquivalent(token, candidate))) hits += 1;
  }
  return hits / queryTokens.length;
}

function charNgrams(text: string, n = 3) {
  const compact = normalizeArabicQuery(text).replace(/\s+/g, '');
  const grams = new Set<string>();
  if (!compact) return grams;
  if (compact.length <= n) {
    grams.add(compact);
    return grams;
  }
  for (let index = 0; index <= compact.length - n; index += 1) grams.add(compact.slice(index, index + n));
  return grams;
}

export function retrievalCharDice(a: string, b: string) {
  const aa = charNgrams(a);
  const bb = charNgrams(b);
  if (aa.size === 0 || bb.size === 0) return 0;
  let hits = 0;
  for (const gram of aa) if (bb.has(gram)) hits += 1;
  return (2 * hits) / (aa.size + bb.size);
}
