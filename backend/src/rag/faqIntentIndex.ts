import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { normalizeArabicQuery } from './normalize.js';
import {
  isAmbiguousSingleRetrievalToken,
  retrievalCharDice,
  retrievalTokenCoverage,
  retrievalTokenDice,
  retrievalTokenEquivalent,
  retrievalTokens
} from './retrievalLexicon.js';

export type FaqIntentEntry = {
  faq_id: string;
  intent: string;
  category?: string;
  query: string;
  canonical_question?: string;
  references: string[];
  keywords?: string[];
  variants?: string[];
};

export type FaqIntentMatch = {
  faqId: string;
  intent: string;
  score: number;
  references: string[];
  canonicalQuestion: string;
  keywords: string[];
  matchedVariant: string;
};

function phraseScore(question: string, candidate: string, idf: Map<string, number>) {
  const qn = normalizeArabicQuery(question);
  const cn = normalizeArabicQuery(candidate);
  if (!qn || !cn) return 0;
  if (qn === cn) return 1;
  if (qn.length >= 7 && cn.includes(qn)) return 0.98;
  if (cn.length >= 7 && qn.includes(cn)) return 0.96;

  const qt = retrievalTokens(question);
  const ct = retrievalTokens(candidate);
  if (!qt.length || !ct.length) return 0;
  if (qt.length === 1 && isAmbiguousSingleRetrievalToken(qt[0] ?? '')) return 0;

  const dice = retrievalTokenDice(qt, ct);
  const coverage = retrievalTokenCoverage(qt, ct);
  const chars = retrievalCharDice(qt.join(' '), ct.join(' '));
  const totalWeight = qt.reduce((sum, token) => sum + (idf.get(token) ?? 1), 0);
  const matchedWeight = qt.reduce((sum, token) => {
    const matched = ct.some((candidateToken) => retrievalTokenEquivalent(token, candidateToken));
    return sum + (matched ? (idf.get(token) ?? 1) : 0);
  }, 0);
  const weightedCoverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  const candidateTotalWeight = ct.reduce((sum, token) => sum + (idf.get(token) ?? 1), 0);
  const candidateMatchedWeight = ct.reduce((sum, token) => {
    const matched = qt.some((queryToken) => retrievalTokenEquivalent(queryToken, token));
    return sum + (matched ? (idf.get(token) ?? 1) : 0);
  }, 0);
  const reverseCoverage = candidateTotalWeight > 0 ? candidateMatchedWeight / candidateTotalWeight : 0;
  const averageCandidateIdf = ct.length > 0 ? candidateTotalWeight / ct.length : 0;
  const candidateSpecificity = Math.min(1, averageCandidateIdf / 3);

  if (coverage === 1 && qt.length >= 2) return Math.max(0.93, dice);
  if (coverage === 1 && qt.length === 1) return Math.max(0.82, dice);
  const weighted = weightedCoverage * 0.74 + dice * 0.16 + chars * 0.10;
  const subsetBoost = reverseCoverage === 1 && ct.length >= 2 ? 0.72 + candidateSpecificity * 0.20 : 0;
  return Math.min(0.94, Math.max(subsetBoost, weighted, dice * 0.48 + coverage * 0.32 + chars * 0.20));
}

function faqPath() {
  return path.resolve(env.DATA_DIR, 'faq', 'faq_canonical_88.jsonl');
}

let cache: { mtimeMs: number; entries: FaqIntentEntry[]; idf: Map<string, number> } | null = null;

async function loadFaqEntries() {
  const target = faqPath();
  try {
    const stat = await fs.stat(target);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache;
    const raw = await fs.readFile(target, 'utf8');
    const entries: FaqIntentEntry[] = raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as FaqIntentEntry)
      .filter((entry) => entry.faq_id && entry.intent && Array.isArray(entry.references));

    const df = new Map<string, number>();
    for (const entry of entries) {
      const text = [entry.query, entry.canonical_question ?? '', ...(entry.variants ?? []), ...(entry.keywords ?? [])].join(' ');
      const tokens = new Set<string>(retrievalTokens(text));
      for (const token of tokens) df.set(token, (df.get(token) ?? 0) + 1);
    }
    const idf = new Map<string, number>();
    for (const [token, count] of df) idf.set(token, Math.log(1 + (entries.length + 1) / (count + 1)));
    cache = { mtimeMs: stat.mtimeMs, entries, idf };
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { entries: [], idf: new Map<string, number>() };
    throw error;
  }
}

export async function matchFaqIntent(question: string): Promise<FaqIntentMatch | null> {
  const { entries, idf } = await loadFaqEntries();
  if (!entries.length) return null;

  // Canonical FAQ variants are curated retrieval examples. If the user's text
  // literally matches one of them, prefer that row before fuzzy scoring. This
  // prevents semantically similar pairs such as "رخصة القيادة" vs
  // "رخصة المركبة" from collapsing to the wrong service reference.
  const literalQuestion = question.trim().replace(/\s+/gu, ' ');
  const literalMatches = entries.flatMap((entry) => {
    const variants = Array.from(new Set([entry.query, entry.canonical_question ?? '', ...(entry.variants ?? [])].filter(Boolean)));
    return variants
      .filter((variant) => variant.trim().replace(/\s+/gu, ' ') === literalQuestion)
      .map((variant) => ({ entry, variant }));
  });

  if (literalMatches.length === 1) {
    const exact = literalMatches[0]!;
    return {
      faqId: exact.entry.faq_id,
      intent: exact.entry.intent,
      score: 1,
      references: exact.entry.references,
      canonicalQuestion: exact.entry.canonical_question ?? exact.entry.query,
      keywords: exact.entry.keywords ?? [],
      matchedVariant: exact.variant
    };
  }

  // Normalized exact matching is useful for harmless orthographic differences,
  // but only when the normalized form is unique across the FAQ set.
  const normalizedQuestion = normalizeArabicQuery(question);
  const normalizedMatches = entries.flatMap((entry) => {
    const variants = Array.from(new Set([entry.query, entry.canonical_question ?? '', ...(entry.variants ?? [])].filter(Boolean)));
    return variants
      .filter((variant) => normalizeArabicQuery(variant) === normalizedQuestion)
      .map((variant) => ({ entry, variant }));
  });
  const normalizedRefSets = new Set(normalizedMatches.map(({ entry }) => [...entry.references].sort().join('|')));
  if (normalizedMatches.length > 0 && normalizedRefSets.size === 1) {
    const exact = normalizedMatches[0]!;
    return {
      faqId: exact.entry.faq_id,
      intent: exact.entry.intent,
      score: 0.995,
      references: exact.entry.references,
      canonicalQuestion: exact.entry.canonical_question ?? exact.entry.query,
      keywords: exact.entry.keywords ?? [],
      matchedVariant: exact.variant
    };
  }

  const scored = entries.map((entry) => {
    const variants = Array.from(new Set([entry.query, entry.canonical_question ?? '', ...(entry.variants ?? [])].filter(Boolean)));
    let score = 0;
    let matchedVariant = variants[0] ?? entry.query;
    for (const variant of variants) {
      const s = phraseScore(question, variant, idf);
      if (s > score) {
        score = s;
        matchedVariant = variant;
      }
    }
    const keywordCandidate = (entry.keywords ?? []).join(' ');
    if (keywordCandidate) score = Math.max(score, phraseScore(question, keywordCandidate, idf) * 0.94);
    return { entry, score, matchedVariant };
  }).sort((a, b) => b.score - a.score);

  const first = scored[0];
  if (!first || first.score < 0.42) return null;

  const firstRefs = [...first.entry.references].sort().join('|');
  const competing = scored.find((item, index) => index > 0 && [...item.entry.references].sort().join('|') !== firstRefs);
  const competingScore = competing?.score ?? 0;
  const margin = first.score - competingScore;
  const confident =
    first.score >= 0.90 ||
    (first.score >= 0.70 && margin >= 0.05) ||
    (first.score >= 0.55 && margin >= 0.09) ||
    (first.score >= 0.42 && margin >= 0.13);
  if (!confident) return null;

  return {
    faqId: first.entry.faq_id,
    intent: first.entry.intent,
    score: first.score,
    references: first.entry.references,
    canonicalQuestion: first.entry.canonical_question ?? first.entry.query,
    keywords: first.entry.keywords ?? [],
    matchedVariant: first.matchedVariant
  };
}

export async function getFaqIndexStats() {
  const { entries } = await loadFaqEntries();
  let variants = 0;
  const references = new Set<string>();
  for (const entry of entries) {
    variants += entry.variants?.length ?? 0;
    for (const reference of entry.references) references.add(reference);
  }
  return { intents: entries.length, variants, references: references.size };
}
