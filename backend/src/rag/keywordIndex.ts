import fs from 'node:fs/promises';
import path from 'node:path';
import type { Document } from '@langchain/core/documents';
import { env } from '../env.js';
import { recordToLegalMetadata } from './legalMetadata.js';
import { tokenizeArabic } from './normalize.js';
import type { LegalMetadata, RetrievedChunk } from './types.js';

export type KeywordIndexEntry = {
  chunkId: string;
  content: string;
  tokens: string[];
  metadata: LegalMetadata;
};

type KeywordIndexFile = {
  version: 1;
  generatedAt: string;
  entries: KeywordIndexEntry[];
};

function indexPath() {
  return path.resolve(env.DATA_DIR, 'index', 'keyword-index.json');
}

let cache: { mtimeMs: number; entries: KeywordIndexEntry[] } | null = null;

async function loadEntries() {
  const target = indexPath();
  try {
    const stat = await fs.stat(target);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.entries;
    const parsed = JSON.parse(await fs.readFile(target, 'utf8')) as KeywordIndexFile;
    cache = { mtimeMs: stat.mtimeMs, entries: parsed.entries ?? [] };
    return cache.entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function writeKeywordIndex(documents: Document[], options: { replace?: boolean } = {}) {
  const newEntries: KeywordIndexEntry[] = documents.map((document) => {
    const metadata = recordToLegalMetadata(document.metadata as Record<string, unknown>);
    const chunkId = metadata.chunkId ?? `${metadata.documentId}:${metadata.pageNumber ?? ''}:${document.pageContent.slice(0, 40)}`;
    return {
      chunkId,
      content: document.pageContent,
      tokens: tokenizeArabic(metadata.normalizedText ?? document.pageContent),
      metadata
    };
  });

  const existing = options.replace ? [] : await loadEntries();
  const map = new Map(existing.map((entry) => [entry.chunkId, entry]));
  for (const entry of newEntries) map.set(entry.chunkId, entry);

  const target = indexPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const payload: KeywordIndexFile = { version: 1, generatedAt: new Date().toISOString(), entries: [...map.values()] };
  await fs.writeFile(target, JSON.stringify(payload));
  cache = null;
  return { entries: payload.entries.length, addedOrUpdated: newEntries.length };
}

function bm25Scores(queryTokens: string[], entries: KeywordIndexEntry[]) {
  const N = entries.length;
  if (!N || !queryTokens.length) return [] as Array<{ entry: KeywordIndexEntry; score: number }>;

  const avgDl = entries.reduce((sum, entry) => sum + Math.max(1, entry.tokens.length), 0) / N;
  const documentFrequency = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    let df = 0;
    for (const entry of entries) if (entry.tokens.includes(token)) df++;
    documentFrequency.set(token, df);
  }

  const k1 = 1.5;
  const b = 0.75;
  return entries.map((entry) => {
    const tf = new Map<string, number>();
    for (const token of entry.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
    const dl = Math.max(1, entry.tokens.length);
    let score = 0;
    for (const token of queryTokens) {
      const freq = tf.get(token) ?? 0;
      if (!freq) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (dl / avgDl))));
    }
    return { entry, score };
  });
}

export async function keywordSearch(query: string, k: number): Promise<RetrievedChunk[]> {
  const entries = await loadEntries();
  const queryTokens = Array.from(new Set(tokenizeArabic(query)));
  return bm25Scores(queryTokens, entries)
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ entry, score }, index) => ({
      chunkId: entry.chunkId,
      content: entry.content,
      excerpt: entry.content.slice(0, env.RAG_EXCERPT_CHARS),
      source: entry.metadata.sourceName,
      ...(entry.metadata.pageNumber !== undefined ? { page: entry.metadata.pageNumber } : {}),
      ...(entry.metadata.pageEnd !== undefined ? { pageEnd: entry.metadata.pageEnd } : {}),
      keywordScore: score,
      keywordRank: index + 1,
      metadata: entry.metadata
    }));
}



export async function keywordLookupByDocumentIds(documentIds: string[]): Promise<RetrievedChunk[]> {
  if (documentIds.length === 0) return [];
  const wanted = new Set(documentIds);
  const entries = await loadEntries();
  return entries
    .filter((entry) => wanted.has(entry.metadata.documentId))
    .map((entry) => ({
      chunkId: entry.chunkId,
      content: entry.content,
      excerpt: entry.content.slice(0, env.RAG_EXCERPT_CHARS),
      source: entry.metadata.sourceName,
      ...(entry.metadata.pageNumber !== undefined ? { page: entry.metadata.pageNumber } : {}),
      ...(entry.metadata.pageEnd !== undefined ? { pageEnd: entry.metadata.pageEnd } : {}),
      keywordScore: Number.MAX_SAFE_INTEGER,
      metadata: entry.metadata
    }));
}

export async function removeKeywordEntries(chunkIds: string[]) {
  if (chunkIds.length === 0) return;
  const remove = new Set(chunkIds);
  const entries = (await loadEntries()).filter((entry) => !remove.has(entry.chunkId));
  const target = indexPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const payload: KeywordIndexFile = { version: 1, generatedAt: new Date().toISOString(), entries };
  await fs.writeFile(target, JSON.stringify(payload));
  cache = null;
}

export async function getKeywordIndexStats() {
  const entries = await loadEntries();
  const documents = new Set(entries.map((entry) => entry.metadata.documentId));
  return { chunks: entries.length, documents: documents.size };
}
