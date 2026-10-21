const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06EDـ]/g;

export function normalizeArabicQuery(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ');
}

export function arabicDigitsToLatin(input: string) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const eastern = '۰۱۲۳۴۵۶۷۸۹';
  return [...input]
    .map((char) => {
      const a = arabic.indexOf(char);
      if (a >= 0) return String(a);
      const e = eastern.indexOf(char);
      return e >= 0 ? String(e) : char;
    })
    .join('');
}

const TOKEN_STOPWORDS = new Set([
  'في', 'من', 'على', 'علي', 'الى', 'الي', 'عن', 'ما', 'ماذا', 'ايه', 'اي', 'هو', 'هي', 'لو', 'هل',
  'ده', 'دي', 'دا', 'اللي', 'الي', 'انا', 'واحد', 'واحده', 'كده', 'قد', 'او', 'و', 'ثم', 'مع', 'حسب'
]);

export function tokenizeArabic(input: string) {
  const normalized = arabicDigitsToLatin(normalizeArabicQuery(input));
  return normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !TOKEN_STOPWORDS.has(token));
}
