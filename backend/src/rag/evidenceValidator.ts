import { env } from '../env.js';
import type { ProcessedQuery } from './queryProcessor.js';
import { bestDynamicRecordMatches, dominantDynamicRecord, hasStrongViolationMatch } from './topicMatcher.js';
import type { RetrievedChunk } from './types.js';
import { isApplicableOn } from './versioning.js';

export type EvidenceValidation = {
  sufficient: boolean;
  evidence: RetrievedChunk[];
  reason: string;
};

function isTrusted(chunk: RetrievedChunk) {
  if (!env.REQUIRE_VERIFIED_LEGAL_SOURCES) return chunk.metadata.sourceStatus !== 'sample';
  return chunk.metadata.sourceStatus === 'official' || chunk.metadata.sourceStatus === 'verified';
}

function isRelevant(query: ProcessedQuery, chunk: RetrievedChunk) {
  if ((chunk.faqMatchScore ?? 0) >= 0.72) return true;
  if (query.entities.articleNumber && chunk.metadata.articleNumber === query.entities.articleNumber) return true;
  if (query.entities.lawNumber && chunk.metadata.lawNumber === query.entities.lawNumber) return true;
  if ((chunk.keywordScore ?? 0) > 0) return true;
  if (chunk.semanticScore !== undefined && chunk.semanticScore <= env.RAG_MAX_SEMANTIC_DISTANCE) return true;
  return (chunk.rerankScore ?? 0) >= env.RAG_MIN_RERANK_SCORE;
}

export function validateEvidence(query: ProcessedQuery, chunks: RetrievedChunk[]): EvidenceValidation {
  if (chunks.length === 0) return { sufficient: false, evidence: [], reason: 'no_retrieval_results' };

  let relevant = chunks.filter((chunk) => isRelevant(query, chunk));
  if (relevant.length === 0) return { sufficient: false, evidence: [], reason: 'retrieval_not_relevant_enough' };

  let reason = 'sufficient';

  // Highest-priority lock: a confident FAQ intent is mapped to explicit legal
  // record IDs. These records are retrieval aids, not authority by themselves;
  // the answer still comes from the referenced verified/official legal records.
  const faqLocked = relevant.filter((chunk) => (chunk.faqMatchScore ?? 0) >= 0.72);
  if (faqLocked.length > 0) {
    relevant = faqLocked;
    reason = 'faq_reference_lock';
  } else {
    // High-confidence fixed topics are kept as a fallback for queries outside
    // the FAQ catalog. They only run when there is no FAQ lock.
    if (query.entities.violation) {
      const exactTopic = relevant.filter((chunk) => hasStrongViolationMatch(query.entities.violation, chunk));
      if (exactTopic.length > 0) {
        relevant = exactTopic;
        reason = 'fixed_topic_lock';
      }
    }

    // Dynamic record matching reads the atomic record's own title, fields, and
    // query aliases, so newly added records do not require new TypeScript cases.
    const dynamicMatches = bestDynamicRecordMatches(query.originalQuestion, relevant);
    if (dynamicMatches.length > 0) {
      relevant = dynamicMatches;
      reason = 'dynamic_topic_lock';
    }

    const dominant = dominantDynamicRecord(query.originalQuestion, relevant);
    if (dominant) {
      relevant = [dominant];
      reason = 'dominant_atomic_record';
    }
  }

  const trusted = relevant.filter(isTrusted);
  if (env.REQUIRE_VERIFIED_LEGAL_SOURCES && trusted.length === 0) {
    return { sufficient: false, evidence: [], reason: 'no_verified_or_official_legal_source' };
  }

  const evidence = env.REQUIRE_VERIFIED_LEGAL_SOURCES ? trusted : relevant;
  const currentPreferred = query.preferCurrent ? evidence.filter((chunk) => isApplicableOn(chunk.metadata)) : evidence;
  const finalEvidence = currentPreferred.length > 0 ? currentPreferred : evidence;

  return {
    sufficient: finalEvidence.length > 0,
    evidence: finalEvidence.slice(0, env.RAG_FINAL_K),
    reason: finalEvidence.length > 0 ? reason : 'no_applicable_legal_version'
  };
}
