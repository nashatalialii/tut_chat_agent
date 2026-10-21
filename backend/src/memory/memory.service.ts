import type { Redis } from 'ioredis';
import type { LegalCitation } from '../rag/types.js';

type MemoryTurn = {
  question: string;
  answerPreview: string;
  citations: Array<{ documentTitle: string; articleNumber?: string }>;
  ts: string;
};

class MemoryService {
  async appendTurn(redis: Redis, sessionId: string, question: string, answer: string, citations: LegalCitation[] = []) {
    const key = `memory:${sessionId}:turns`;
    const turn: MemoryTurn = {
      question,
      answerPreview: answer.slice(0, 180),
      citations: citations.slice(0, 3).map((citation) => ({
        documentTitle: citation.documentTitle,
        ...(citation.articleNumber ? { articleNumber: citation.articleNumber } : {})
      })),
      ts: new Date().toISOString()
    };
    await redis.rpush(key, JSON.stringify(turn));
    await redis.ltrim(key, -12, -1);
    await redis.expire(key, 60 * 60 * 24 * 14);
  }

  async getSessionContext(redis: Redis, sessionId: string) {
    const raw = await redis.lrange(`memory:${sessionId}:turns`, -5, -1);
    const turns = raw.flatMap((value: string) => {
      try {
        return [JSON.parse(value) as MemoryTurn];
      } catch {
        return [];
      }
    });

    return turns
      .map((turn: MemoryTurn) => {
        const refs = turn.citations
          .map((citation: MemoryTurn['citations'][number]) => `${citation.documentTitle}${citation.articleNumber ? ` (مادة ${citation.articleNumber})` : ''}`)
          .join('، ');
        return `سؤال سابق: ${turn.question}${refs ? `\nمراجع الإجابة السابقة: ${refs}` : ''}`;
      })
      .join('\n\n');
  }

  async clear(redis: Redis, sessionId: string) {
    await redis.del(`memory:${sessionId}:summary`, `memory:${sessionId}:turns`);
  }
}

export const memoryService = new MemoryService();
