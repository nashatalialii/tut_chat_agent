import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';
import { generateText } from '../rag/llm.js';

type EvalCase = { id: string; question: string; expected_answer: string | null };
const dataset = JSON.parse(await fs.readFile(path.resolve(env.DATA_DIR, 'eval', 'retrieval.json'), 'utf8')) as EvalCase[];
const cases = dataset.filter((item) => item.expected_answer);
const models = (env.LLM_BENCHMARK_MODELS ?? env.LLM_MODEL).split(',').map((value) => value.trim()).filter(Boolean);

if (cases.length === 0) {
  console.log('No verified expected_answer cases are available. Model quality benchmark was not fabricated. Add verified answer cases first.');
  process.exit(0);
}

for (const model of models) {
  const timings: number[] = [];
  for (const item of cases) {
    const started = Date.now();
    await generateText('أجب فقط من النص المرجعي الموجود في سؤال الاختبار ولا تضف معلومات.', item.question, model);
    timings.push(Date.now() - started);
  }
  console.log(JSON.stringify({ model, cases: cases.length, averageLatencyMs: timings.reduce((a, b) => a + b, 0) / timings.length }));
}
