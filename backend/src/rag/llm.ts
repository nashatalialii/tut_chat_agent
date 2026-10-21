import { OllamaEmbeddings } from '@langchain/ollama';
import { env } from '../env.js';

export const embeddings = new OllamaEmbeddings({
  baseUrl: env.OLLAMA_BASE_URL,
  model: env.EMBEDDING_MODEL
});

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
  done?: boolean;
};

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timeout) };
}

export async function generateText(system: string, user: string, model = env.LLM_MODEL) {
  const { controller, clear } = timeoutSignal(env.LLM_TIMEOUT_MS);

  try {
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: env.OLLAMA_KEEP_ALIVE,
        options: {
          temperature: 0.1,
          num_predict: env.LLM_NUM_PREDICT,
          num_ctx: env.LLM_NUM_CTX,
          top_p: 0.9,
          repeat_penalty: 1.05
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Ollama chat failed ${response.status}: ${text.slice(0, 500)}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    const content = data.message?.content ?? data.response ?? '';
    return content.trim();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama timed out after ${env.LLM_TIMEOUT_MS}ms. جرّب موديل أخف أو قلل LLM_NUM_PREDICT.`);
    }
    throw error;
  } finally {
    clear();
  }
}

export async function* streamText(system: string, user: string, signal?: AbortSignal, model = env.LLM_MODEL) {
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    ...(signal ? { signal } : {}),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      keep_alive: env.OLLAMA_KEEP_ALIVE,
      options: {
        temperature: 0.1,
        num_predict: env.LLM_NUM_PREDICT,
        num_ctx: env.LLM_NUM_CTX,
        top_p: 0.9,
        repeat_penalty: 1.05
      },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const data = JSON.parse(trimmed) as OllamaChatResponse;
      const token = data.message?.content ?? data.response ?? '';
      if (token) yield token;
    }
  }
}
