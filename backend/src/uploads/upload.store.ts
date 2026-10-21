import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import { env } from '../env.js';
import { loadDocumentFile } from '../rag/loader.js';
import { chunkDocuments } from '../rag/chunker.js';
import { trafficVectorStore } from '../rag/vectorStore.js';
import { removeKeywordEntries, writeKeywordIndex } from '../rag/keywordIndex.js';
import { recordToLegalMetadata, type LegalMetadataInput } from '../rag/legalMetadata.js';
import { readKnowledgeManifest, writeKnowledgeManifest } from '../rag/knowledgeBase.js';

export type UploadProgress = {
  uploadId: string;
  status: 'created' | 'receiving' | 'validating' | 'pending_review' | 'publishing' | 'done' | 'rejected' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message?: string;
  filename?: string;
};

type UploadState = UploadProgress & { filename: string; filePath: string; createdAt: string };

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.md', '.txt', '.csv']);
const progressEmitter = new EventEmitter();
const uploads = new Map<string, UploadState>();

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_\-.\u0600-\u06FF]/g, '_').slice(0, 160);
}

function validateFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`Unsupported upload type: ${ext || '(none)'}`);
  return safeFilename(path.basename(filename));
}

function emit(state: UploadState) {
  const progress: UploadProgress = {
    uploadId: state.uploadId,
    status: state.status,
    receivedBytes: state.receivedBytes,
    totalBytes: state.totalBytes,
    filename: state.filename,
    ...(state.message ? { message: state.message } : {})
  };
  progressEmitter.emit(`upload:${state.uploadId}`, progress);
}

async function persist(state: UploadState) {
  await fs.mkdir(env.QUARANTINE_DIR, { recursive: true });
  await fs.writeFile(path.join(env.QUARANTINE_DIR, `${state.uploadId}.upload.json`), JSON.stringify(state, null, 2));
}

async function updateState(state: UploadState, patch: Partial<UploadState>) {
  Object.assign(state, patch);
  await persist(state);
  emit(state);
}

async function ensureState(uploadId: string) {
  const existing = uploads.get(uploadId);
  if (existing) return existing;
  try {
    const raw = await fs.readFile(path.join(env.QUARANTINE_DIR, `${uploadId}.upload.json`), 'utf8');
    const state = JSON.parse(raw) as UploadState;
    uploads.set(uploadId, state);
    return state;
  } catch {
    throw new Error('Upload not found');
  }
}

async function upsertManifestFromChunks(chunks: Awaited<ReturnType<typeof chunkDocuments>>) {
  const existing = (await readKnowledgeManifest())?.documents ?? [];
  const grouped = new Map(existing.map((entry) => [entry.documentId, entry]));
  const currentCounts = new Map<string, { documentId: string; contentHash: string; chunks: number; sourceStatus: string }>();
  for (const chunk of chunks) {
    const metadata = recordToLegalMetadata(chunk.metadata as Record<string, unknown>);
    const current = currentCounts.get(metadata.documentId);
    currentCounts.set(metadata.documentId, {
      documentId: metadata.documentId,
      contentHash: metadata.contentHash,
      chunks: (current?.chunks ?? 0) + 1,
      sourceStatus: metadata.sourceStatus
    });
  }
  for (const entry of currentCounts.values()) grouped.set(entry.documentId, entry);
  return writeKnowledgeManifest([...grouped.values()]);
}

export const uploadStore = {
  emitter: progressEmitter,

  async create(filename: string, totalBytes: number) {
    if (totalBytes <= 0 || totalBytes > env.MAX_UPLOAD_BYTES) {
      throw new Error(`Upload size must be between 1 byte and ${env.MAX_UPLOAD_BYTES} bytes.`);
    }
    const cleaned = validateFilename(filename);
    await fs.mkdir(env.QUARANTINE_DIR, { recursive: true });
    const uploadId = nanoid();
    const filePath = path.join(env.QUARANTINE_DIR, `${uploadId}-${cleaned}`);
    const state: UploadState = {
      uploadId,
      filename: cleaned,
      filePath,
      totalBytes,
      receivedBytes: 0,
      status: 'created',
      createdAt: new Date().toISOString()
    };
    uploads.set(uploadId, state);
    await fs.writeFile(filePath, Buffer.alloc(0));
    await persist(state);
    emit(state);
    return { uploadId };
  },

  async pushChunk(uploadId: string, base64: string) {
    const state = await ensureState(uploadId);
    if (!['created', 'receiving'].includes(state.status)) throw new Error(`Upload cannot receive data while status=${state.status}`);
    const chunk = Buffer.from(base64, 'base64');
    if (chunk.length === 0) throw new Error('Empty upload chunk');
    if (state.receivedBytes + chunk.length > state.totalBytes || state.receivedBytes + chunk.length > env.MAX_UPLOAD_BYTES) {
      throw new Error('Upload exceeds declared or configured size limit.');
    }
    await fs.appendFile(state.filePath, chunk);
    await updateState(state, { receivedBytes: state.receivedBytes + chunk.length, status: 'receiving' });
    return { receivedBytes: state.receivedBytes };
  },

  async complete(uploadId: string) {
    const state = await ensureState(uploadId);
    if (state.receivedBytes !== state.totalBytes) throw new Error(`Upload incomplete: received ${state.receivedBytes}/${state.totalBytes} bytes.`);
    await updateState(state, { status: 'validating', message: 'جاري التحقق من سلامة الاستخراج قبل المراجعة.' });

    try {
      const docs = await loadDocumentFile(state.filePath);
      if (docs.length === 0) throw new Error('No extractable document content found.');
      await updateState(state, {
        status: 'pending_review',
        message: `تم التحقق من الاستخراج (${docs.length} صفحة/وحدة). المستند في الحجر ولم يُنشر في قاعدة المعرفة.`
      });
      return { ok: true, status: 'pending_review' as const, extractedUnits: docs.length };
    } catch (error) {
      await updateState(state, { status: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async publish(uploadId: string, metadata: LegalMetadataInput) {
    const state = await ensureState(uploadId);
    if (state.status !== 'pending_review') throw new Error(`Only pending_review uploads can be published; current status=${state.status}`);
    if (!['official', 'verified'].includes(String(metadata.sourceStatus ?? metadata.source_status ?? ''))) {
      throw new Error('Publishing requires sourceStatus=official or verified after admin review.');
    }

    await updateState(state, { status: 'publishing', message: 'جاري نشر النسخة المراجعة في قاعدة المعرفة.' });
    const legalDir = path.resolve(env.DATA_DIR, 'legal');
    await fs.mkdir(legalDir, { recursive: true });
    const publishedName = `admin-${uploadId}-${state.filename}`;
    const publishedPath = path.join(legalDir, publishedName);
    const sidecarPath = `${publishedPath}.meta.json`;
    let chunkIds: string[] = [];

    try {
      await fs.copyFile(state.filePath, publishedPath);
      await fs.writeFile(sidecarPath, JSON.stringify(metadata, null, 2));
      const docs = await loadDocumentFile(publishedPath);
      const chunks = await chunkDocuments(docs);
      chunkIds = chunks.map((chunk) => String(chunk.metadata.chunkId ?? '')).filter(Boolean);
      const result = await trafficVectorStore.ingest(chunks);
      await writeKeywordIndex(chunks, { replace: false });
      const manifest = await upsertManifestFromChunks(chunks);
      await updateState(state, {
        status: 'done',
        message: `تم نشر ${result.added} مقطع. إصدار قاعدة المعرفة: ${manifest.version}`
      });
      return { ok: true, chunks: result.added, knowledgeBaseVersion: manifest.version };
    } catch (error) {
      await Promise.allSettled([
        trafficVectorStore.deleteChunks(chunkIds),
        removeKeywordEntries(chunkIds),
        fs.rm(publishedPath, { force: true }),
        fs.rm(sidecarPath, { force: true })
      ]);
      await updateState(state, { status: 'error', message: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  },

  async reject(uploadId: string, reason: string) {
    const state = await ensureState(uploadId);
    if (!['pending_review', 'error'].includes(state.status)) throw new Error(`Cannot reject upload while status=${state.status}`);
    await updateState(state, { status: 'rejected', message: reason.slice(0, 500) });
    return { ok: true };
  },

  async list() {
    await fs.mkdir(env.QUARANTINE_DIR, { recursive: true });
    const files = await fs.readdir(env.QUARANTINE_DIR);
    const states: UploadState[] = [];
    for (const file of files.filter((name) => name.endsWith('.upload.json'))) {
      try {
        states.push(JSON.parse(await fs.readFile(path.join(env.QUARANTINE_DIR, file), 'utf8')) as UploadState);
      } catch {
        // Ignore corrupted state files here; they remain visible on disk for manual investigation.
      }
    }
    return states.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ filePath: _filePath, ...state }) => state);
  },

  async get(uploadId: string) {
    try {
      const state = await ensureState(uploadId);
      const { filePath: _filePath, ...safe } = state;
      return safe;
    } catch {
      return null;
    }
  }
};
