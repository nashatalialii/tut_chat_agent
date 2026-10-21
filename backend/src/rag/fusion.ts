import type { RetrievedChunk } from './types.js';

function identity(chunk: RetrievedChunk) {
  return chunk.chunkId ?? chunk.metadata.chunkId ?? `${chunk.metadata.documentId}:${chunk.metadata.articleNumber ?? ''}:${chunk.page ?? ''}:${chunk.content.slice(0, 80)}`;
}

export function reciprocalRankFusion(
  semantic: RetrievedChunk[],
  keyword: RetrievedChunk[],
  rrfK = 60
): RetrievedChunk[] {
  const merged = new Map<string, RetrievedChunk & { fusionScore: number }>();

  const add = (chunk: RetrievedChunk, rank: number, kind: 'semantic' | 'keyword') => {
    const key = identity(chunk);
    const existing = merged.get(key);
    const score = 1 / (rrfK + rank);
    const base = existing ?? { ...chunk, fusionScore: 0 };
    base.fusionScore += score;
    if (kind === 'semantic') {
      base.semanticRank = rank;
      if (chunk.semanticScore !== undefined) base.semanticScore = chunk.semanticScore;
    } else {
      base.keywordRank = rank;
      if (chunk.keywordScore !== undefined) base.keywordScore = chunk.keywordScore;
    }
    merged.set(key, base);
  };

  semantic.forEach((chunk, index) => add(chunk, index + 1, 'semantic'));
  keyword.forEach((chunk, index) => add(chunk, index + 1, 'keyword'));

  return [...merged.values()]
    .sort((a, b) => b.fusionScore - a.fusionScore)
    .map((chunk, index) => ({ ...chunk, fusionRank: index + 1 }));
}
