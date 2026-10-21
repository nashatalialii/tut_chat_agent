import fs from 'node:fs/promises';
import path from 'node:path';
import { Document } from '@langchain/core/documents';
import pdf from 'pdf-parse';
import { env } from '../env.js';
import { buildBaseMetadata, metadataToRecord, type LegalMetadataInput } from './legalMetadata.js';

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

type PdfTextContent = {
  items?: PdfTextItem[];
};

type PdfPageLike = {
  getTextContent(options?: Record<string, unknown>): Promise<PdfTextContent>;
};

export class DocumentExtractionError extends Error {
  constructor(message: string, readonly code: 'EMPTY_TEXT' | 'SCANNED_PDF' | 'CORRUPTED_TEXT' | 'UNSUPPORTED') {
    super(message);
    this.name = 'DocumentExtractionError';
  }
}

function cleanExtractedText(text: string) {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function suspiciousReplacementRatio(text: string) {
  if (!text.length) return 1;
  const suspicious = (text.match(/�/g) ?? []).length;
  return suspicious / text.length;
}

function renderPdfItems(items: PdfTextItem[]) {
  const positioned = items
    .map((item, index) => {
      const transform = item.transform ?? [];
      const x = Number(transform[4] ?? index);
      const y = Number(transform[5] ?? 0);
      return { text: item.str ?? '', x, y, index };
    })
    .filter((item) => item.text.trim());

  positioned.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2.5) return yDiff;
    const xDiff = a.x - b.x;
    return xDiff !== 0 ? xDiff : a.index - b.index;
  });

  const lines: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = [];
  for (const item of positioned) {
    const current = lines.at(-1);
    if (!current || Math.abs(current.y - item.y) > 2.5) {
      lines.push({ y: item.y, parts: [{ x: item.x, text: item.text }] });
    } else {
      current.parts.push({ x: item.x, text: item.text });
    }
  }

  return cleanExtractedText(
    lines
      .map((line) => line.parts.sort((a, b) => a.x - b.x).map((part) => part.text.trim()).join(' '))
      .join('\n')
  );
}

async function readSidecar(filePath: string): Promise<LegalMetadataInput | undefined> {
  const candidates = [
    `${filePath}.meta.json`,
    path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.meta.json`)
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as LegalMetadataInput;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw new Error(`Invalid metadata sidecar ${candidate}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return undefined;
}

async function loadPdf(filePath: string, source: string): Promise<Document[]> {
  const buffer = await fs.readFile(filePath);
  const pageTexts: string[] = [];
  let pageCounter = 0;

  const parsed = await pdf(buffer, {
    pagerender: async (pageData: PdfPageLike) => {
      const pageIndex = pageCounter++;
      const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      const rendered = renderPdfItems(content.items ?? []);
      pageTexts[pageIndex] = rendered;
      return rendered;
    }
  });

  if (pageTexts.length === 0 && parsed.text?.trim()) pageTexts.push(cleanExtractedText(parsed.text));

  const combined = pageTexts.join('\n');
  const nonWhitespaceChars = combined.replace(/\s/g, '').length;
  const averageChars = pageTexts.length > 0 ? nonWhitespaceChars / pageTexts.length : 0;

  if (nonWhitespaceChars === 0 || averageChars < env.PDF_MIN_TEXT_CHARS_PER_PAGE) {
    throw new DocumentExtractionError(
      `PDF extraction produced too little text (${Math.round(averageChars)} chars/page). The document may be scanned and requires OCR before ingestion.`,
      'SCANNED_PDF'
    );
  }
  if (suspiciousReplacementRatio(combined) > env.MAX_CORRUPTED_TEXT_RATIO) {
    throw new DocumentExtractionError('PDF extraction contains too many corrupted replacement characters.', 'CORRUPTED_TEXT');
  }

  const sidecar = await readSidecar(filePath);
  const base = buildBaseMetadata({ filename: source, fileContent: buffer, extractedText: combined, ...(sidecar ? { sidecar } : {}) });

  return pageTexts
    .map((pageText, index) => ({ pageText: cleanExtractedText(pageText), pageNumber: index + 1 }))
    .filter(({ pageText }) => pageText.length > 0)
    .map(({ pageText, pageNumber }) => new Document({
      pageContent: pageText,
      metadata: metadataToRecord({ ...base, pageNumber })
    }));
}

async function loadTextDocument(filePath: string, source: string) {
  const raw = await fs.readFile(filePath, 'utf8');
  const text = cleanExtractedText(raw);
  if (!text) throw new DocumentExtractionError(`Document ${source} is empty after extraction.`, 'EMPTY_TEXT');
  if (suspiciousReplacementRatio(text) > env.MAX_CORRUPTED_TEXT_RATIO) {
    throw new DocumentExtractionError(`Document ${source} appears to contain corrupted text.`, 'CORRUPTED_TEXT');
  }

  const sidecar = await readSidecar(filePath);
  const base = buildBaseMetadata({ filename: source, fileContent: raw, extractedText: text, ...(sidecar ? { sidecar } : {}) });
  return [new Document({ pageContent: text, metadata: metadataToRecord(base) })];
}

export async function loadDocumentFile(filePath: string): Promise<Document[]> {
  const ext = path.extname(filePath).toLowerCase();
  const source = path.basename(filePath);

  if (ext === '.pdf') return loadPdf(filePath, source);
  if (['.md', '.txt', '.csv'].includes(ext)) return loadTextDocument(filePath, source);

  throw new DocumentExtractionError(`Unsupported file type: ${ext || '(none)'}`, 'UNSUPPORTED');
}

export type LoadDocumentsResult = {
  documents: Document[];
  errors: Array<{ file: string; error: string; code?: string }>;
};

export async function loadDocumentsFromDir(dir: string): Promise<LoadDocumentsResult> {
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const documents: Document[] = [];
  const errors: LoadDocumentsResult['errors'] = [];

  for (const entry of entries) {
    if (!entry.isFile() || entry.name.endsWith('.meta.json')) continue;
    const filePath = path.join(dir, entry.name);
    try {
      documents.push(...(await loadDocumentFile(filePath)));
    } catch (error) {
      const extraction = error instanceof DocumentExtractionError ? error : undefined;
      errors.push({
        file: entry.name,
        error: error instanceof Error ? error.message : String(error),
        ...(extraction ? { code: extraction.code } : {})
      });
    }
  }

  return { documents, errors };
}
