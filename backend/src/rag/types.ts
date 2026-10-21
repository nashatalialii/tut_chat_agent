export type LegalDocumentType = 'law' | 'regulation' | 'amendment' | 'decision' | 'other';
export type LegalSourceStatus = 'official' | 'verified' | 'unverified' | 'sample';

export type LegalMetadata = {
  documentId: string;
  documentTitle: string;
  documentType: LegalDocumentType;
  lawNumber?: string;
  lawYear?: string;
  articleNumber?: string;
  chapter?: string;
  section?: string;
  jurisdiction: 'Egypt';
  sourceName: string;
  sourceUrl?: string;
  pageNumber?: number;
  pageEnd?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  version?: string;
  isCurrent?: boolean;
  language: 'ar';
  contentHash: string;
  chunkId?: string;
  sourceStatus: LegalSourceStatus;
  originalFilename: string;
  originalText?: string;
  normalizedText?: string;
};

export type LegalCitation = {
  documentId: string;
  documentTitle: string;
  documentType: LegalDocumentType;
  lawNumber?: string;
  lawYear?: string;
  articleNumber?: string;
  pageNumber?: number;
  pageEnd?: number;
  sourceName: string;
  sourceUrl?: string;
  version?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceStatus: LegalSourceStatus;
};

export type RagSource = {
  chunkId?: string;
  source: string;
  page?: number;
  pageEnd?: number;
  excerpt: string;
  score?: number;
  semanticScore?: number;
  keywordScore?: number;
  fusionScore?: number;
  rerankScore?: number;
  faqMatchScore?: number;
  faqId?: string;
  faqIntent?: string;
  faqMatchedVariant?: string;
  metadata: LegalMetadata;
};

export type RagDebugTrace = {
  originalQuestion: string;
  normalizedQuery: string;
  retrievalQuery: string;
  intent: string;
  entities: Record<string, string | string[] | undefined>;
  keywords: string[];
  semanticResults: Array<Pick<RagSource, 'chunkId' | 'source' | 'semanticScore'>>;
  keywordResults: Array<Pick<RagSource, 'chunkId' | 'source' | 'keywordScore'>>;
  fusionResults: Array<Pick<RagSource, 'chunkId' | 'source' | 'fusionScore'>>;
  rerankedResults: Array<Pick<RagSource, 'chunkId' | 'source' | 'rerankScore'>>;
  evidence: Array<Pick<RagSource, 'chunkId' | 'source' | 'rerankScore'>>;
  evidenceReason: string;
  promptContext?: string;
};

export type RagAnswer = {
  answer: string;
  sources: RagSource[];
  citations: LegalCitation[];
  cached: boolean;
  latencyMs: number;
  debug?: RagDebugTrace;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type RetrievedChunk = RagSource & {
  content: string;
  semanticRank?: number;
  keywordRank?: number;
  fusionRank?: number;
};
