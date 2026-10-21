import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { processLegalQuery } from '../rag/queryProcessor.js';
import { hybridRetrieve } from '../rag/hybridRetriever.js';
import { legalReranker } from '../rag/reranker.js';
import { meanReciprocalRank, recallAtK, type RankedEvaluationCase } from '../eval/metrics.js';

type EvalCase = {
  id: string;
  question: string;
  expected_source: string | null;
  expected_article: string | null;
  expected_topic: string | null;
  expected_answer: string | null;
  requires_verified_legal_source: boolean;
};

const datasetPath = path.resolve(env.DATA_DIR, 'eval', 'retrieval.json');
const dataset = JSON.parse(await fs.readFile(datasetPath, 'utf8')) as EvalCase[];
const scorable = dataset.filter((item) => item.expected_source || item.expected_article);
const ranked: RankedEvaluationCase[] = [];

for (const item of scorable) {
  const query = processLegalQuery(item.question);
  const retrieval = await hybridRetrieve(query);
  const reranked = await legalReranker.rerank(query, retrieval.fused, 10);
  const expectedId = item.expected_article ? `article:${item.expected_article}` : `source:${item.expected_source}`;
  const retrievedIds = reranked.map((chunk) =>
    item.expected_article ? `article:${chunk.metadata.articleNumber ?? ''}` : `source:${chunk.metadata.originalFilename}`
  );
  ranked.push({ expectedId, retrievedIds });
  console.log(JSON.stringify({ id: item.id, expectedId, retrievedIds: retrievedIds.slice(0, 5) }));
}

const metrics = {
  evaluatedCases: ranked.length,
  recallAt1: recallAtK(ranked, 1),
  recallAt3: recallAtK(ranked, 3),
  recallAt5: recallAtK(ranked, 5),
  recallAt10: recallAtK(ranked, 10),
  mrr: meanReciprocalRank(ranked)
};
console.log(JSON.stringify(metrics, null, 2));
