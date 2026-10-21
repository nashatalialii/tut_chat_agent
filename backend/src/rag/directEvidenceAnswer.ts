import type { ProcessedQuery } from './queryProcessor.js';
import {
  bestDynamicRecordMatches,
  dominantDynamicRecord,
  hasStrongViolationMatch,
  recordQueryMatchScore
} from './topicMatcher.js';
import type { RetrievedChunk } from './types.js';

function inlineField(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^\\s*(?:\\*\\*)?${escaped}\\s*:\\s*(?:\\*\\*)?\\s*(.+?)\\s*$`, 'imu');
  return content.match(regex)?.[1]?.replace(/\*\*/g, '').trim();
}

function sectionText(content: string, heading: string) {
  const lines = content.split(/\r?\n/u);
  const wanted = heading.trim();
  let inside = false;
  const out: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/u);
    if (headingMatch) {
      if (inside) break;
      inside = (headingMatch[1] ?? '').trim() === wanted;
      continue;
    }
    if (inside && line) out.push(line.replace(/^[-*]\s+/u, '').trim());
  }

  return out.join(' ').replace(/\*\*/g, '').trim() || undefined;
}

function recordStatus(content: string) {
  return inlineField(content, 'حالة السجل') ?? inlineField(content, 'الحالة القانونية');
}

function isCaseAssessment(chunk: RetrievedChunk) {
  return /requires_case_assessment/u.test(recordStatus(chunk.content) ?? '');
}

function exactTopicChunk(processed: ProcessedQuery, evidence: RetrievedChunk[]) {
  const faq = evidence
    .filter((chunk) => (chunk.faqMatchScore ?? 0) >= 0.72)
    .sort((a, b) => (b.faqMatchScore ?? 0) - (a.faqMatchScore ?? 0));
  if (faq.length === 1) return faq[0];

  if (processed.entities.violation) {
    const exact = evidence.find((chunk) => hasStrongViolationMatch(processed.entities.violation, chunk));
    if (exact) return exact;
  }

  const dynamic = bestDynamicRecordMatches(processed.originalQuestion, evidence);
  if (dynamic.length === 1) return dynamic[0];
  if (dynamic.length > 1) {
    const scored = dynamic
      .map((chunk) => ({ chunk, score: recordQueryMatchScore(processed.originalQuestion, chunk) }))
      .sort((a, b) => b.score - a.score);
    const first = scored[0];
    const second = scored[1];
    if (first && (!second || first.score - second.score >= 0.05)) return first.chunk;
  }

  return dominantDynamicRecord(processed.originalQuestion, evidence);
}

function normalizeSentence(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /[.!؟]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function answerParts(chunk: RetrievedChunk, processed: ProcessedQuery) {
  const shortAnswer = sectionText(chunk.content, 'إجابة مختصرة') ?? inlineField(chunk.content, 'إجابة مختصرة');
  const penalty = inlineField(chunk.content, 'العقوبة') ?? inlineField(chunk.content, 'الغرامة / العقوبة') ?? inlineField(chunk.content, 'العقوبة المذكورة');
  const fine = inlineField(chunk.content, 'الغرامة');
  const imprisonment = inlineField(chunk.content, 'الحبس');
  const additionalPenalty = inlineField(chunk.content, 'إجراء إضافي') ?? inlineField(chunk.content, 'العقوبة الإضافية');
  const article = inlineField(chunk.content, 'المادة/المرجع') ?? inlineField(chunk.content, 'المادة المذكورة في الملخص');

  if (processed.intent === 'license_action') {
    const licenseText = [additionalPenalty, shortAnswer]
      .filter((value): value is string => Boolean(value))
      .find((value) => /رخص/u.test(value));
    if (!licenseText) return [];

    // Older tests/records explicitly identify themselves as user summaries.
    // Keep their historical wording, but do not label verified/official KB
    // evidence as a "summary".
    const isLegacySummary =
      chunk.metadata.sourceStatus === 'unverified' ||
      /ملخص/u.test(chunk.metadata.sourceName ?? '');
    const rendered = isLegacySummary && !/^حسب الملخص/u.test(licenseText)
      ? `حسب الملخص، ${licenseText}`
      : licenseText;
    return [normalizeSentence(rendered)];
  }

  if (shortAnswer) return [normalizeSentence(shortAnswer)];

  const parts: string[] = [];
  if (penalty) parts.push(penalty);
  else {
    if (fine && fine !== '—') parts.push(`الغرامة: ${fine}`);
    if (imprisonment && imprisonment !== '—') parts.push(`الحبس: ${imprisonment}`);
  }
  if (additionalPenalty && additionalPenalty !== '—') parts.push(additionalPenalty);
  if (article) parts.push(`المرجع: ${article}`);
  return parts.map(normalizeSentence);
}

/**
 * Deterministic answer for strongly matched verified atomic records.
 * A confident FAQ match may map to one or more legal records. If the records
 * are straightforward, combine their explicit short answers without asking
 * the LLM to choose between unrelated penalties. Case-assessment records remain
 * on the explanatory LLM path.
 */
export function buildDirectEvidenceAnswer(processed: ProcessedQuery, evidence: RetrievedChunk[]): string | undefined {
  if (processed.intent === 'article_lookup' || processed.intent === 'settlement_procedure') return undefined;

  const faqEvidence = evidence.filter((chunk) => (chunk.faqMatchScore ?? 0) >= 0.72);
  if (faqEvidence.length > 0) {
    if (faqEvidence.some(isCaseAssessment)) return undefined;
    const parts = faqEvidence.flatMap((chunk) => answerParts(chunk, processed));
    const unique = Array.from(new Set(parts.filter(Boolean)));
    if (unique.length > 0) return unique.join(' ');
  }

  const chunk = exactTopicChunk(processed, evidence);
  if (!chunk || isCaseAssessment(chunk)) return undefined;

  const parts = answerParts(chunk, processed);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
