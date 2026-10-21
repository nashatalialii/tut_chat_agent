import path from 'node:path';
import { env } from '../env.js';
import { loadDocumentsFromDir } from '../rag/loader.js';
import { chunkDocuments } from '../rag/chunker.js';
import { trafficVectorStore } from '../rag/vectorStore.js';
import { writeKeywordIndex } from '../rag/keywordIndex.js';
import { recordToLegalMetadata } from '../rag/legalMetadata.js';
import { writeKnowledgeManifest } from '../rag/knowledgeBase.js';

const legalDir = path.resolve(env.DATA_DIR, 'legal');
const rebuild = !process.argv.includes('--incremental');
console.log(`[ingest] loading legal documents from ${legalDir}`);
const loaded = await loadDocumentsFromDir(legalDir);

for (const error of loaded.errors) {
  console.error(`[ingest] rejected ${error.file}${error.code ? ` (${error.code})` : ''}: ${error.error}`);
}
if (loaded.documents.length === 0) {
  console.error('[ingest] no valid documents were extracted; index was not modified.');
  process.exitCode = 1;
} else {
  console.log(`[ingest] extracted ${loaded.documents.length} page/document units`);
  const chunks = await chunkDocuments(loaded.documents);
  console.log(`[ingest] created ${chunks.length} legal-aware chunks`);

  if (rebuild) {
    console.log('[ingest] rebuilding derived Chroma index (source files are preserved).');
    await trafficVectorStore.clearIndex();
  }

  const result = await trafficVectorStore.ingest(chunks);
  const keyword = await writeKeywordIndex(chunks, { replace: true });

  const grouped = new Map<string, { documentId: string; contentHash: string; chunks: number; sourceStatus: string }>();
  for (const chunk of chunks) {
    const metadata = recordToLegalMetadata(chunk.metadata as Record<string, unknown>);
    const current = grouped.get(metadata.documentId);
    grouped.set(metadata.documentId, {
      documentId: metadata.documentId,
      contentHash: metadata.contentHash,
      chunks: (current?.chunks ?? 0) + 1,
      sourceStatus: metadata.sourceStatus
    });
  }
  const manifest = await writeKnowledgeManifest([...grouped.values()]);

  console.log(`[ingest] indexed ${result.added} chunks in Chroma`);
  console.log(`[ingest] keyword index contains ${keyword.entries} chunks`);
  console.log(`[ingest] knowledge-base version: ${manifest.version}`);
  if (loaded.errors.length > 0) console.warn(`[ingest] completed with ${loaded.errors.length} rejected document(s).`);
}
