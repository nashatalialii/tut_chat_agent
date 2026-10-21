import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

export type KnowledgeManifest = {
  version: string;
  generatedAt: string;
  ingestionVersion: string;
  documents: Array<{ documentId: string; contentHash: string; chunks: number; sourceStatus: string }>;
};

export const INGESTION_VERSION = 'legal-rag-v2';

export function manifestPath() {
  return path.resolve(env.DATA_DIR, 'index', 'manifest.json');
}

export async function readKnowledgeManifest(): Promise<KnowledgeManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath(), 'utf8');
    return JSON.parse(raw) as KnowledgeManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function getKnowledgeBaseVersion() {
  const manifest = await readKnowledgeManifest();
  return manifest?.version ?? 'unversioned';
}

export function calculateKnowledgeVersion(documents: KnowledgeManifest['documents']) {
  const stable = [...documents]
    .sort((a, b) => a.documentId.localeCompare(b.documentId))
    .map((doc) => `${doc.documentId}:${doc.contentHash}:${doc.chunks}:${doc.sourceStatus}`)
    .join('|');
  return crypto.createHash('sha256').update(`${INGESTION_VERSION}|${stable}`).digest('hex').slice(0, 20);
}

export async function writeKnowledgeManifest(documents: KnowledgeManifest['documents']) {
  const target = manifestPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const manifest: KnowledgeManifest = {
    version: calculateKnowledgeVersion(documents),
    generatedAt: new Date().toISOString(),
    ingestionVersion: INGESTION_VERSION,
    documents
  };
  await fs.writeFile(target, JSON.stringify(manifest, null, 2));
  return manifest;
}
