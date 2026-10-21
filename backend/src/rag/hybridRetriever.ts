import { env } from '../env.js';
import { matchFaqIntent, type FaqIntentMatch } from './faqIntentIndex.js';
import { reciprocalRankFusion } from './fusion.js';
import { keywordLookupByDocumentIds, keywordSearch } from './keywordIndex.js';
import type { ProcessedQuery } from './queryProcessor.js';
import type { RetrievedChunk } from './types.js';
import { trafficVectorStore } from './vectorStore.js';

export type HybridRetrievalResult = {
  semantic: RetrievedChunk[];
  keyword: RetrievedChunk[];
  fused: RetrievedChunk[];
  faqMatch?: FaqIntentMatch;
  timings: { semanticMs: number; keywordMs: number; totalMs: number };
};

function identity(chunk: RetrievedChunk) {
  return chunk.chunkId ?? chunk.metadata.chunkId ?? `${chunk.metadata.documentId}:${chunk.metadata.articleNumber ?? ''}:${chunk.page ?? ''}`;
}

function mergeExactFaqReferences(fused: RetrievedChunk[], exact: RetrievedChunk[], faqMatch: FaqIntentMatch | null) {
  if (!faqMatch) return fused;
  const refs = new Set(faqMatch.references);
  const map = new Map<string, RetrievedChunk>();

  for (const chunk of [...exact, ...fused]) {
    const isFaqReference = refs.has(chunk.metadata.documentId);
    const annotated: RetrievedChunk = {
      ...chunk,
      ...(isFaqReference ? {
        faqMatchScore: faqMatch.score,
        faqId: faqMatch.faqId,
        faqIntent: faqMatch.intent,
        faqMatchedVariant: faqMatch.matchedVariant
      } : {})
    };
    const key = identity(chunk);
    const existing = map.get(key);
    if (!existing || (annotated.faqMatchScore ?? 0) > (existing.faqMatchScore ?? 0)) map.set(key, annotated);
  }

  return [...map.values()].sort((a, b) => {
    const faqDiff = (b.faqMatchScore ?? 0) - (a.faqMatchScore ?? 0);
    if (faqDiff !== 0) return faqDiff;
    return (b.fusionScore ?? 0) - (a.fusionScore ?? 0);
  });
}

export async function hybridRetrieve(query: ProcessedQuery): Promise<HybridRetrievalResult> {
  const started = Date.now();
  const faqMatch = await matchFaqIntent(query.originalQuestion).catch(() => null);
  const enhancedQuery = faqMatch
    ? `${query.retrievalQuery}\nالسؤال المرجعي: ${faqMatch.canonicalQuestion}\nكلمات المطابقة: ${faqMatch.keywords.join(' ')}`
    : query.retrievalQuery;

  const semanticStarted = Date.now();
  const semanticPromise = trafficVectorStore.search(enhancedQuery, env.RAG_CANDIDATE_K).then((result) => ({ result, ms: Date.now() - semanticStarted }));
  const keywordStarted = Date.now();
  const keywordPromise = keywordSearch(enhancedQuery, env.RAG_CANDIDATE_K).then((result) => ({ result, ms: Date.now() - keywordStarted }));
  const exactFaqPromise = faqMatch ? keywordLookupByDocumentIds(faqMatch.references) : Promise.resolve([] as RetrievedChunk[]);

  const [semanticResult, keywordResult, exactFaq] = await Promise.all([semanticPromise, keywordPromise, exactFaqPromise]);
  const fusedBase = reciprocalRankFusion(semanticResult.result, keywordResult.result, env.RAG_RRF_K);
  const fused = mergeExactFaqReferences(fusedBase, exactFaq, faqMatch);

  return {
    semantic: semanticResult.result,
    keyword: keywordResult.result,
    fused,
    ...(faqMatch ? { faqMatch } : {}),
    timings: { semanticMs: semanticResult.ms, keywordMs: keywordResult.ms, totalMs: Date.now() - started }
  };
}
