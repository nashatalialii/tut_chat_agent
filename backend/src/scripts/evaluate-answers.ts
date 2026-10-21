import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { RagPipeline } from '../rag/pipeline.js';
import { redis } from '../redis/client.js';

type EvalCase = {
  id: string;
  question: string;
  expected_source: string | null;
  expected_article: string | null;
  expected_answer: string | null;
  requires_verified_legal_source: boolean;
};

const dataset = JSON.parse(await fs.readFile(path.resolve(env.DATA_DIR, 'eval', 'retrieval.json'), 'utf8')) as EvalCase[];
const pipeline = new RagPipeline(redis);
const cases = dataset.filter((item) => item.expected_answer || item.requires_verified_legal_source);

if (cases.length === 0) {
  console.log('No answer-evaluation cases are supported by verified expected data. No score was fabricated.');
  process.exit(0);
}

const results: Array<Record<string, unknown>> = [];
for (const item of cases) {
  const sessionId = `eval:${item.id}`;
  await redis.del(`memory:${sessionId}:turns`, `memory:${sessionId}:summary`);
  const result = await pipeline.answer({ question: item.question, sessionId });
  const abstained = result.answer.includes('لم أجد في المصادر القانونية المتاحة نصًا كافيًا للإجابة بدقة');
  const citationMatchesSource = item.expected_source
    ? result.citations.some((citation) => citation.sourceName === item.expected_source || citation.documentTitle === item.expected_source)
    : null;
  const citationMatchesArticle = item.expected_article
    ? result.citations.some((citation) => citation.articleNumber === item.expected_article)
    : null;

  results.push({
    id: item.id,
    latencyMs: result.latencyMs,
    abstained,
    citationMatchesSource,
    citationMatchesArticle,
    expectedAnswerAvailable: Boolean(item.expected_answer)
  });
}

console.log(JSON.stringify({
  cases: results,
  note: 'Factual correctness/hallucination scores require verified expected_answer values and are intentionally not fabricated.'
}, null, 2));
await redis.quit();
