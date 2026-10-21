import type { LegalCitation, RetrievedChunk } from './types.js';

export function buildLegalCitations(chunks: RetrievedChunk[]): LegalCitation[] {
  const seen = new Set<string>();
  const citations: LegalCitation[] = [];

  for (const chunk of chunks) {
    const metadata = chunk.metadata;
    const key = [metadata.documentId, metadata.articleNumber ?? '', metadata.pageNumber ?? ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);

    citations.push({
      documentId: metadata.documentId,
      documentTitle: metadata.documentTitle,
      documentType: metadata.documentType,
      ...(metadata.lawNumber ? { lawNumber: metadata.lawNumber } : {}),
      ...(metadata.lawYear ? { lawYear: metadata.lawYear } : {}),
      ...(metadata.articleNumber ? { articleNumber: metadata.articleNumber } : {}),
      ...(metadata.pageNumber !== undefined ? { pageNumber: metadata.pageNumber } : {}),
      ...(metadata.pageEnd !== undefined ? { pageEnd: metadata.pageEnd } : {}),
      sourceName: metadata.sourceName,
      ...(metadata.sourceUrl ? { sourceUrl: metadata.sourceUrl } : {}),
      ...(metadata.version ? { version: metadata.version } : {}),
      ...(metadata.effectiveFrom ? { effectiveFrom: metadata.effectiveFrom } : {}),
      ...(metadata.effectiveTo ? { effectiveTo: metadata.effectiveTo } : {}),
      sourceStatus: metadata.sourceStatus
    });
  }

  return citations;
}
