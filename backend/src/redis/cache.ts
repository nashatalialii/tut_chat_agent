import crypto from 'node:crypto';
import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { normalizeArabicQuery } from '../rag/normalize.js';
import type { LegalCitation, RagSource } from '../rag/types.js';

export type CachedAnswer = {
  answer: string;
  sources: RagSource[];
  citations: LegalCitation[];
  cachedAt: string;
  model: string;
};

export type CacheScope = {
  knowledgeBaseVersion: string;
  legalVersion: string;
  modelVersion: string;
  conversationFingerprint?: string;
};

type SemanticRecord = {
  normalizedQuestion: string;
  embedding: number[];
  scopeHash: string;
  value: CachedAnswer;
};

const sha = (input: string) => crypto.createHash('sha256').update(input).digest('hex');

export function conversationFingerprint(history: Array<{ role: string; content: string }>, memoryContext = '') {
  const recent = history
    .filter((message) => message.role !== 'system')
    .slice(-4)
    .map((message) => `${message.role}:${message.content}`)
    .join('|');
  if (!recent && !memoryContext) return undefined;
  return sha(`${recent}|${memoryContext}`).slice(0, 20);
}

function scopeHash(scope: CacheScope) {
  return sha([
    scope.knowledgeBaseVersion,
    scope.legalVersion,
    scope.modelVersion,
    scope.conversationFingerprint ?? 'no-conversation'
  ].join('|')).slice(0, 24);
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let an = 0;
  let bn = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    an += av * av;
    bn += bv * bv;
  }
  return an === 0 || bn === 0 ? 0 : dot / (Math.sqrt(an) * Math.sqrt(bn));
}

export class RagSemanticCache {
  constructor(private readonly redis: Redis) {}

  keyFor(question: string, scope: CacheScope) {
    return `rag:v7:exact:${scopeHash(scope)}:${sha(normalizeArabicQuery(question))}`;
  }

  async getExact(question: string, scope: CacheScope): Promise<CachedAnswer | null> {
    const raw = await this.redis.get(this.keyFor(question, scope));
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  }

  async setExact(question: string, scope: CacheScope, value: CachedAnswer) {
    await this.redis.set(this.keyFor(question, scope), JSON.stringify(value), 'EX', env.CACHE_TTL_SECONDS);
  }

  async set(question: string, embedding: number[], scope: CacheScope, value: CachedAnswer) {
    await this.setExact(question, scope, value);
    if (!env.ENABLE_SEMANTIC_CACHE || scope.conversationFingerprint) return;

    const normalizedQuestion = normalizeArabicQuery(question);
    const hash = scopeHash(scope);
    const record: SemanticRecord = { normalizedQuestion, embedding, scopeHash: hash, value };
    const semanticKey = `rag:v7:semantic:${hash}:${sha(normalizedQuestion)}`;
    const indexKey = `rag:v7:semantic:index:${hash}`;
    await this.redis.set(semanticKey, JSON.stringify(record), 'EX', env.CACHE_TTL_SECONDS);
    await this.redis.zadd(indexKey, Date.now(), semanticKey);
    await this.redis.expire(indexKey, env.CACHE_TTL_SECONDS);
    await this.redis.zremrangebyrank(indexKey, 0, -501);
  }

  async getSemantic(question: string, embedding: number[], scope: CacheScope): Promise<CachedAnswer | null> {
    const exact = await this.getExact(question, scope);
    if (exact) return exact;
    if (!env.ENABLE_SEMANTIC_CACHE || scope.conversationFingerprint) return null;

    const hash = scopeHash(scope);
    const keys = await this.redis.zrevrange(`rag:v7:semantic:index:${hash}`, 0, 100);
    let best: { score: number; answer: CachedAnswer } | null = null;

    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      const record = JSON.parse(raw) as SemanticRecord;
      if (record.scopeHash !== hash) continue;
      const score = cosine(embedding, record.embedding);
      if (!best || score > best.score) best = { score, answer: record.value };
    }

    return best && best.score >= env.SEMANTIC_CACHE_THRESHOLD ? best.answer : null;
  }
}
