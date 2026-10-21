import crypto from 'node:crypto';
import path from 'node:path';
import type { LegalDocumentType, LegalMetadata, LegalSourceStatus } from './types.js';
import { arabicDigitsToLatin, normalizeArabicQuery } from './normalize.js';

type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined;
};

export type LegalMetadataInput = OptionalWithUndefined<Omit<LegalMetadata, 'contentHash' | 'jurisdiction' | 'language' | 'originalFilename'>> & {
  document_id?: string | undefined;
  document_title?: string | undefined;
  document_type?: LegalDocumentType | undefined;
  law_number?: string | undefined;
  law_year?: string | undefined;
  source_name?: string | undefined;
  source_url?: string | undefined;
  effective_from?: string | undefined;
  effective_to?: string | null | undefined;
  is_current?: boolean | undefined;
  source_status?: LegalSourceStatus | undefined;
};

export function sha256(input: string | Buffer) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function inferLawIdentity(text: string) {
  const normalizedDigits = arabicDigitsToLatin(text);
  const match = normalizedDigits.match(/(?:قانون\s+المرور[^\n]{0,80}?)?رقم\s*\(?\s*(\d{1,4})\s*\)?\s*(?:لسنه|لسنة)\s*(\d{4})/u);
  return match ? { lawNumber: match[1], lawYear: match[2] } : {};
}

export function buildBaseMetadata(args: {
  filename: string;
  fileContent: Buffer | string;
  extractedText: string;
  sidecar?: LegalMetadataInput;
}): LegalMetadata {
  const contentHash = sha256(args.fileContent);
  const inferred = inferLawIdentity(normalizeArabicQuery(args.extractedText));
  const sidecar = args.sidecar ?? {};
  const baseName = path.basename(args.filename);
  const sample = /sample|عينة/u.test(baseName) || /ملف عينه|ملف عينة/u.test(args.extractedText.slice(0, 800));

  const documentTitle = cleanOptional(sidecar.documentTitle) ?? cleanOptional(sidecar.document_title) ?? path.basename(baseName, path.extname(baseName));
  const documentId = cleanOptional(sidecar.documentId) ?? cleanOptional(sidecar.document_id) ?? `doc_${contentHash.slice(0, 20)}`;
  const rawDocumentType = sidecar.documentType ?? sidecar.document_type;
  const documentType: LegalDocumentType = rawDocumentType && ['law', 'regulation', 'amendment', 'decision', 'other'].includes(rawDocumentType) ? rawDocumentType : 'other';
  const lawNumber = cleanOptional(sidecar.lawNumber ?? sidecar.law_number) ?? inferred.lawNumber;
  const lawYear = cleanOptional(sidecar.lawYear ?? sidecar.law_year) ?? inferred.lawYear;
  const sourceName = cleanOptional(sidecar.sourceName ?? sidecar.source_name) ?? baseName;
  const sourceUrl = cleanOptional(sidecar.sourceUrl ?? sidecar.source_url);
  const effectiveFrom = cleanOptional(sidecar.effectiveFrom ?? sidecar.effective_from);
  const effectiveTo = cleanOptional(sidecar.effectiveTo ?? sidecar.effective_to);
  const version = cleanOptional(sidecar.version);
  const isCurrent = sidecar.isCurrent ?? sidecar.is_current;
  const rawSourceStatus = sidecar.sourceStatus ?? sidecar.source_status;
  const sourceStatus: LegalSourceStatus = rawSourceStatus && ['official', 'verified', 'unverified', 'sample'].includes(rawSourceStatus)
    ? rawSourceStatus
    : (sample ? 'sample' : 'unverified');

  return {
    documentId,
    documentTitle,
    documentType,
    ...(lawNumber ? { lawNumber } : {}),
    ...(lawYear ? { lawYear } : {}),
    jurisdiction: 'Egypt',
    sourceName,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
    ...(version ? { version } : {}),
    ...(typeof isCurrent === 'boolean' ? { isCurrent } : {}),
    language: 'ar',
    contentHash,
    sourceStatus,
    originalFilename: baseName
  };
}

export function metadataToRecord(metadata: LegalMetadata): Record<string, string | number | boolean> {
  const record: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') record[key] = value;
  }
  return record;
}

export function recordToLegalMetadata(record: Record<string, unknown>): LegalMetadata {
  const getString = (key: string, fallback = '') => (typeof record[key] === 'string' ? String(record[key]) : fallback);
  const getOptionalString = (key: string) => (typeof record[key] === 'string' && String(record[key]).trim() ? String(record[key]) : undefined);
  const getOptionalNumber = (key: string) => (typeof record[key] === 'number' ? Number(record[key]) : undefined);
  const getOptionalBoolean = (key: string) => (typeof record[key] === 'boolean' ? Boolean(record[key]) : undefined);

  const lawNumber = getOptionalString('lawNumber');
  const lawYear = getOptionalString('lawYear');
  const articleNumber = getOptionalString('articleNumber');
  const chapter = getOptionalString('chapter');
  const section = getOptionalString('section');
  const sourceUrl = getOptionalString('sourceUrl');
  const pageNumber = getOptionalNumber('pageNumber');
  const pageEnd = getOptionalNumber('pageEnd');
  const effectiveFrom = getOptionalString('effectiveFrom');
  const effectiveTo = getOptionalString('effectiveTo');
  const version = getOptionalString('version');
  const isCurrent = getOptionalBoolean('isCurrent');
  const chunkId = getOptionalString('chunkId');
  const originalText = getOptionalString('originalText');
  const normalizedText = getOptionalString('normalizedText');

  return {
    documentId: getString('documentId', 'unknown'),
    documentTitle: getString('documentTitle', getString('sourceName', 'unknown')),
    documentType: getString('documentType', 'other') as LegalDocumentType,
    ...(lawNumber ? { lawNumber } : {}),
    ...(lawYear ? { lawYear } : {}),
    ...(articleNumber ? { articleNumber } : {}),
    ...(chapter ? { chapter } : {}),
    ...(section ? { section } : {}),
    jurisdiction: 'Egypt',
    sourceName: getString('sourceName', getString('source', 'unknown')),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...(pageEnd !== undefined ? { pageEnd } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
    ...(version ? { version } : {}),
    ...(isCurrent !== undefined ? { isCurrent } : {}),
    language: 'ar',
    contentHash: getString('contentHash', 'unknown'),
    ...(chunkId ? { chunkId } : {}),
    sourceStatus: getString('sourceStatus', 'unverified') as LegalSourceStatus,
    originalFilename: getString('originalFilename', getString('sourceName', 'unknown')),
    ...(originalText ? { originalText } : {}),
    ...(normalizedText ? { normalizedText } : {})
  };
}
