import { normalizeArabicQuery, tokenizeArabic } from './normalize.js';
import type { ProcessedQuery } from './queryProcessor.js';
import { recordQueryMatchScore, violationMatchScore } from './topicMatcher.js';
import type { RetrievedChunk } from './types.js';
import { versionPreferenceScore } from './versioning.js';

export interface LegalReranker {
  rerank(query: ProcessedQuery, chunks: RetrievedChunk[], limit: number): Promise<RetrievedChunk[]>;
}

function overlapRatio(queryTokens: string[], content: string) {
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(tokenizeArabic(content));
  const hits = queryTokens.filter((token) => contentTokens.has(token)).length;
  return hits / queryTokens.length;
}

function sourceTrust(status: RetrievedChunk['metadata']['sourceStatus']) {
  if (status === 'official') return 1;
  if (status === 'verified') return 0.8;
  if (status === 'unverified') return 0.35;
  return 0;
}

export class RuleBasedLegalReranker implements LegalReranker {
  async rerank(query: ProcessedQuery, chunks: RetrievedChunk[], limit: number) {
    const normalizedQuestion = normalizeArabicQuery(query.retrievalQuery);
    const queryTokens = query.keywords;

    return chunks
      .map((chunk) => {
        const normalizedContent = chunk.metadata.normalizedText ?? normalizeArabicQuery(chunk.content);
        const exactArticle = query.entities.articleNumber && chunk.metadata.articleNumber === query.entities.articleNumber ? 1 : 0;
        const exactLaw = query.entities.lawNumber && chunk.metadata.lawNumber === query.entities.lawNumber ? 1 : 0;
        const exactYear = query.entities.lawYear && chunk.metadata.lawYear === query.entities.lawYear ? 1 : 0;
        const phraseMatch = normalizedQuestion.length > 8 && normalizedContent.includes(normalizedQuestion) ? 1 : 0;
        const lexical = overlapRatio(queryTokens, normalizedContent);
        const fusion = Math.min(1, (chunk.fusionScore ?? 0) * 30);
        const current = versionPreferenceScore(chunk.metadata, query.preferCurrent);
        const trust = sourceTrust(chunk.metadata.sourceStatus);
        const fixedTopic = violationMatchScore(query.entities.violation, chunk);
        const dynamicTopic = recordQueryMatchScore(query.originalQuestion, chunk);
        const faqTopic = chunk.faqMatchScore ?? 0;
        const topic = Math.max(fixedTopic, dynamicTopic, faqTopic);

        // Atomic-record identity is the strongest signal. Dynamic topic scoring
        // lets the full verified KB work without enumerating every legal topic in code.
        const score = Math.min(1,
          topic * 0.56 +
          exactArticle * 0.12 +
          exactLaw * 0.04 +
          exactYear * 0.02 +
          phraseMatch * 0.04 +
          lexical * 0.10 +
          fusion * 0.06 +
          current * 0.03 +
          trust * 0.03
        );

        return { ...chunk, rerankScore: score };
      })
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0))
      .slice(0, limit);
  }
}

export const legalReranker: LegalReranker = new RuleBasedLegalReranker();
