import { Chroma } from '@langchain/community/vectorstores/chroma';
import type { Document } from '@langchain/core/documents';
import { env } from '../env.js';
import { embeddings } from './llm.js';
import { recordToLegalMetadata } from './legalMetadata.js';
import type { RetrievedChunk } from './types.js';

export class TrafficLawVectorStore {
  private store: Chroma | null = null;

  async getStore() {
    if (!this.store) {
      this.store = new Chroma(embeddings, {
        collectionName: env.CHROMA_COLLECTION,
        url: env.CHROMA_URL
      });
    }
    return this.store;
  }

  async ingest(documents: Document[]) {
    if (documents.length === 0) return { added: 0 };
    const store = await this.getStore();
    const ids = documents.map((document, index) => String(document.metadata.chunkId ?? `chunk-${index}`));

    // Deterministic IDs make re-ingestion idempotent. Remove only the chunks being
    // replaced; authoritative source files remain untouched on disk.
    await store.delete({ ids }).catch(() => undefined);
    await store.addDocuments(documents, { ids });
    return { added: documents.length };
  }

  async deleteChunks(ids: string[]) {
    if (ids.length === 0) return;
    const store = await this.getStore();
    await store.delete({ ids });
  }

  async clearIndex() {
    const store = await this.getStore();
    const collection = await store.ensureCollection();
    const existing = await collection.get();
    if (existing.ids.length > 0) {
      await store.delete({ ids: existing.ids });
    }
  }

  async search(query: string, k = 6): Promise<RetrievedChunk[]> {
    const store = await this.getStore();
    const results = await store.similaritySearchWithScore(query, k);
    return results.map(([doc, score], index) => {
      const metadata = recordToLegalMetadata(doc.metadata as Record<string, unknown>);
      return {
        ...(metadata.chunkId ? { chunkId: metadata.chunkId } : {}),
        content: doc.pageContent,
        excerpt: doc.pageContent.slice(0, env.RAG_EXCERPT_CHARS),
        source: metadata.sourceName,
        ...(metadata.pageNumber !== undefined ? { page: metadata.pageNumber } : {}),
        ...(metadata.pageEnd !== undefined ? { pageEnd: metadata.pageEnd } : {}),
        score,
        semanticScore: score,
        semanticRank: index + 1,
        metadata
      };
    });
  }
}

export const trafficVectorStore = new TrafficLawVectorStore();
