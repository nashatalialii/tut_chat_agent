import crypto from 'node:crypto';
import { Document } from '@langchain/core/documents';
import type { Document as DocumentType } from '@langchain/core/documents';
import { env } from '../env.js';
import { metadataToRecord, recordToLegalMetadata } from './legalMetadata.js';
import { arabicDigitsToLatin, normalizeArabicQuery } from './normalize.js';
import type { LegalMetadata } from './types.js';

const CHUNKING_VERSION = 'legal-v2';
const ARTICLE_RE = /^\s*(?:المادة|مادة)\s*\(?\s*([0-9٠-٩۰-۹]{1,4}(?:\s*(?:مكرر(?:اً|ا)?|مكررا))?)\s*\)?\s*[:\-ـ]?\s*(.*)$/u;
const CHAPTER_RE = /^\s*((?:الباب|الفصل)\s+[^\n]{1,100})\s*$/u;
const SECTION_RE = /^\s*((?:القسم|الفرع)\s+[^\n]{1,100})\s*$/u;

type LegalBlock = {
  lines: string[];
  metadata: LegalMetadata;
  startPage?: number;
  endPage?: number;
};

function chunkId(metadata: LegalMetadata, text: string, part: number) {
  const value = [CHUNKING_VERSION, metadata.documentId, metadata.articleNumber ?? '', part, text].join('|');
  return `chunk_${crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function splitLongText(text: string, maxChars: number, overlapChars: number) {
  if (text.length <= maxChars) return [text];
  const paragraphs = text.split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();
    if (value) parts.push(value);
    current = '';
  };

  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (paragraph.length > maxChars) {
      flush();
      let start = 0;
      while (start < paragraph.length) {
        const end = Math.min(paragraph.length, start + maxChars);
        parts.push(paragraph.slice(start, end).trim());
        if (end >= paragraph.length) break;
        start = Math.max(start + 1, end - overlapChars);
      }
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      const previousTail = current.slice(Math.max(0, current.length - overlapChars)).trim();
      flush();
      current = previousTail ? `${previousTail}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return parts;
}

function createChunk(block: LegalBlock, text: string, part: number) {
  const articleNumber = block.metadata.articleNumber;
  const structuralContext = [block.metadata.chapter, block.metadata.section]
    .filter((value): value is string => Boolean(value))
    .join('\n');

  const pageContent = structuralContext && !text.startsWith(structuralContext)
    ? `${structuralContext}\n${text}`.trim()
    : text.trim();

  const metadata: LegalMetadata = {
    ...block.metadata,
    ...(block.startPage !== undefined ? { pageNumber: block.startPage } : {}),
    ...(block.endPage !== undefined && block.endPage !== block.startPage ? { pageEnd: block.endPage } : {}),
    ...(articleNumber ? { articleNumber } : {}),
    originalText: pageContent,
    normalizedText: normalizeArabicQuery(pageContent),
    chunkId: chunkId(block.metadata, pageContent, part)
  };

  return new Document({ pageContent, metadata: metadataToRecord(metadata) });
}

export async function chunkDocuments(documents: DocumentType[]) {
  const chunks: DocumentType[] = [];
  const grouped = new Map<string, DocumentType[]>();

  for (const document of documents) {
    const metadata = recordToLegalMetadata(document.metadata as Record<string, unknown>);
    const list = grouped.get(metadata.documentId) ?? [];
    list.push(document);
    grouped.set(metadata.documentId, list);
  }

  for (const docs of grouped.values()) {
    docs.sort((a, b) => Number(a.metadata.pageNumber ?? 0) - Number(b.metadata.pageNumber ?? 0));
    const firstMetadata = recordToLegalMetadata(docs[0]?.metadata as Record<string, unknown>);
    let currentChapter: string | undefined;
    let currentSection: string | undefined;
    let currentArticle: string | undefined;
    let block: LegalBlock = { lines: [], metadata: firstMetadata };

    const flush = () => {
      const text = block.lines.join('\n').trim();
      if (!text) return;
      // Atomic RAG records are authored as one legal fact bundle per file.
      // Keep them together so a penalty, article, additional action and aliases
      // never get split into separate chunks and mixed with another violation.
      const atomicRecord = /(?:\*\*)?معرف السجل(?:\*\*)?\s*:/u.test(text);
      const atomicMaxChars = Math.max(env.LEGAL_CHUNK_MAX_CHARS, 5000);
      const pieces = atomicRecord
        ? splitLongText(text, atomicMaxChars, 0)
        : splitLongText(text, env.LEGAL_CHUNK_MAX_CHARS, env.LEGAL_CHUNK_OVERLAP_CHARS);
      pieces.forEach((piece, index) => chunks.push(createChunk(block, piece, index + 1)));
      block = {
        lines: [],
        metadata: {
          ...block.metadata,
          ...(currentChapter ? { chapter: currentChapter } : {}),
          ...(currentSection ? { section: currentSection } : {}),
          ...(currentArticle ? { articleNumber: currentArticle } : {})
        }
      };
    };

    for (const document of docs) {
      const pageMetadata = recordToLegalMetadata(document.metadata as Record<string, unknown>);
      const pageNumber = pageMetadata.pageNumber;
      const lines = document.pageContent.split('\n');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          if (block.lines.at(-1) !== '') block.lines.push('');
          continue;
        }

        const chapter = line.match(CHAPTER_RE)?.[1];
        if (chapter) {
          flush();
          currentChapter = chapter;
          currentSection = undefined;
          currentArticle = undefined;
          block = { lines: [line], metadata: { ...pageMetadata, chapter: chapter }, ...(pageNumber ? { startPage: pageNumber, endPage: pageNumber } : {}) };
          continue;
        }

        const section = line.match(SECTION_RE)?.[1];
        if (section) {
          flush();
          currentSection = section;
          currentArticle = undefined;
          block = {
            lines: [line],
            metadata: { ...pageMetadata, ...(currentChapter ? { chapter: currentChapter } : {}), section },
            ...(pageNumber ? { startPage: pageNumber, endPage: pageNumber } : {})
          };
          continue;
        }

        const article = line.match(ARTICLE_RE);
        if (article?.[1]) {
          flush();
          currentArticle = arabicDigitsToLatin(article[1].replace(/\s+/g, ' ').trim());
          block = {
            lines: [line],
            metadata: {
              ...pageMetadata,
              ...(currentChapter ? { chapter: currentChapter } : {}),
              ...(currentSection ? { section: currentSection } : {}),
              articleNumber: currentArticle
            },
            ...(pageNumber ? { startPage: pageNumber, endPage: pageNumber } : {})
          };
          continue;
        }

        if (block.lines.length === 0) {
          block.metadata = {
            ...pageMetadata,
            ...(currentChapter ? { chapter: currentChapter } : {}),
            ...(currentSection ? { section: currentSection } : {}),
            ...(currentArticle ? { articleNumber: currentArticle } : {})
          };
          if (pageNumber) block.startPage = pageNumber;
        }
        if (pageNumber) block.endPage = pageNumber;
        block.lines.push(line);
      }
    }
    flush();
  }

  return chunks;
}
