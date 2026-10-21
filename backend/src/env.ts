import 'dotenv/config';
import { z } from 'zod';

const booleanFromEnv = (defaultValue: boolean) =>
  z.preprocess((value: unknown) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return value;
  }, z.boolean());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CHROMA_URL: z.string().url().default('http://localhost:8000'),
  CHROMA_COLLECTION: z.string().default('egypt_traffic_laws'),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_MODEL: z.string().default('llama3.1:8b'),
  EMBEDDING_MODEL: z.string().default('bge-m3'),

  ENABLE_SEMANTIC_CACHE: booleanFromEnv(false),
  RAG_TOP_K: z.coerce.number().int().min(1).max(10).default(3),
  RAG_CANDIDATE_K: z.coerce.number().int().min(3).max(30).default(12),
  RAG_FINAL_K: z.coerce.number().int().min(1).max(8).default(4),
  RAG_RRF_K: z.coerce.number().int().min(10).max(200).default(60),
  RAG_EXCERPT_CHARS: z.coerce.number().int().min(120).max(1200).default(500),
  RAG_CONTEXT_CHARS_PER_CHUNK: z.coerce.number().int().min(500).max(5000).default(1800),
  RAG_MIN_RERANK_SCORE: z.coerce.number().min(0).max(1).default(0.2),
  RAG_MAX_SEMANTIC_DISTANCE: z.coerce.number().min(0).max(3).default(1.2),
  RAG_DEBUG: booleanFromEnv(false),
  REQUIRE_VERIFIED_LEGAL_SOURCES: booleanFromEnv(true),
  LEGAL_VERSION: z.string().default('current'),

  LEGAL_CHUNK_MAX_CHARS: z.coerce.number().int().min(600).max(5000).default(1800),
  LEGAL_CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(500).default(180),
  PDF_MIN_TEXT_CHARS_PER_PAGE: z.coerce.number().int().min(0).max(1000).default(40),
  MAX_CORRUPTED_TEXT_RATIO: z.coerce.number().min(0).max(0.5).default(0.02),

  MEMORY_CONTEXT_CHARS: z.coerce.number().int().min(0).max(3000).default(700),
  LLM_NUM_PREDICT: z.coerce.number().int().min(64).max(1200).default(280),
  LLM_NUM_CTX: z.coerce.number().int().min(512).max(8192).default(3072),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5000).max(180000).default(60000),
  RAG_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(3000).max(120000).default(30000),
  REDIS_TIMEOUT_MS: z.coerce.number().int().min(200).max(10000).default(1500),
  OLLAMA_KEEP_ALIVE: z.string().default('20m'),

  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
  SEMANTIC_CACHE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  DATA_DIR: z.string().default('../data'),
  UPLOAD_DIR: z.string().default('../data/uploads'),
  QUARANTINE_DIR: z.string().default('../data/quarantine'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  ADMIN_API_TOKEN: z.string().min(16).optional(),
  USER_API_TOKEN: z.string().min(16).optional(),
  STT_SERVICE_URL: z.string().url().optional(),
  TTS_SERVICE_URL: z.string().url().optional(),
  TTS_FALLBACK_SERVICE_URL: z.string().url().optional(),
  VOICE_STT_TIMEOUT_MS: z.coerce.number().int().min(5000).max(300000).default(120000),
  VOICE_TTS_TIMEOUT_MS: z.coerce.number().int().min(5000).max(900000).default(300000),
  VOICE_MAX_AUDIO_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  LLM_BENCHMARK_MODELS: z.string().optional()
});

export const env = EnvSchema.parse(process.env);
