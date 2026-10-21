# مروري — Arabic-first Egyptian Traffic Law Legal RAG

This repository upgrades the existing Egyptian Traffic Laws chatbot from generic vector RAG into a legal-oriented retrieval pipeline while preserving Next.js, tRPC, Redis, Chroma, BGE-M3, Ollama, WebSocket voice, and Docker.

## Legal RAG pipeline

```text
Question
  -> Arabic/Egyptian query understanding
  -> optional deterministic retrieval rewrite
  -> Chroma semantic search + BM25 keyword search
  -> Reciprocal Rank Fusion
  -> legal reranking
  -> evidence validation
  -> grounded Ollama answer
  -> backend-generated legal citations
```

The application abstains with a clear Arabic response when evidence is insufficient. It does not ask the LLM to invent article numbers, fines, dates, or citation metadata.

## Important source-safety behavior

The bundled file `data/legal/egypt_traffic_law_sample.md` is demonstration content only. Its sidecar marks it as `sample`. With the default setting:

```env
REQUIRE_VERIFIED_LEGAL_SOURCES=true
```

sample/unverified text cannot become the basis of a legal answer. Add reviewed legal sources and metadata before production use. See `docs/LEGAL_KNOWLEDGE_BASE.md`.

## Run with Docker

Create the environment file:

```powershell
copy .env.example .env
```

For knowledge-base administration, set a long random token in `.env`:

```env
ADMIN_API_TOKEN=replace-with-a-long-random-secret
```

Start services:

```powershell
docker compose down
docker compose up -d --build
```

Pull the configured local models:

```powershell
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull bge-m3
```

Build the derived legal indexes from `data/legal`:

```powershell
docker compose exec backend pnpm ingest
```

Open:

```text
Frontend: http://localhost:3000
Backend health: http://localhost:4000/healthz
Backend readiness: http://localhost:4000/readyz
```

## Ingestion

The ingestion path is:

```text
file validation
 -> extraction
 -> extraction-quality checks
 -> legal structure detection
 -> legal-aware chunks
 -> structured metadata
 -> BGE-M3 embeddings / Chroma
 -> BM25 index
 -> knowledge-base manifest/version
```

Supported sources: PDF, Markdown, TXT, CSV. Likely scanned PDFs fail closed and report that OCR is required; no OCR service is fabricated by this project.

A regular `pnpm ingest` rebuilds the derived indexes from the source files. To perform incremental indexing from the CLI instead:

```bash
pnpm ingest -- --incremental
```

## Secure upload workflow

Upload-related tRPC procedures now require the admin bearer token. The workflow is:

```text
upload -> size/type validation -> quarantine -> extraction validation
       -> pending_review -> admin publish/reject -> index/version update
```

Available procedures include:

- `upload.create`
- `upload.pushChunk`
- `upload.complete`
- `upload.list`
- `upload.publish`
- `upload.reject`
- `knowledge.stats`

A minimal admin UI is available at `http://localhost:3000/admin`. It stores the admin token only in browser `sessionStorage`; production deployments should replace static bearer-token administration with their organization's authentication/session system.

Completing an upload does **not** publish it to the legal index.

## RAG debug mode

Debug traces are disabled by default:

```env
RAG_DEBUG=false
```

When enabled, `chat.ask` returns its debug trace only when the request is authenticated with the admin token and explicitly sets `debug: true`. The trace includes normalized/retrieval queries, intent/entities, semantic and BM25 results, fusion, reranking, final evidence, and prompt context.

## Evaluation

The repository includes an initial non-fabricated evaluation dataset. Cases that require real verified legal text are marked accordingly rather than supplied with invented answers.

After dependencies/services/models are available:

```bash
pnpm test
pnpm eval:retrieval
pnpm eval:answers
```

Retrieval evaluation reports Recall@1/3/5/10 and MRR. Answer evaluation intentionally refuses to fabricate factual-correctness scores when verified expected answers are missing.

Local-model benchmark framework:

```env
LLM_BENCHMARK_MODELS=llama3.1:8b,qwen2.5:7b
```

```bash
pnpm benchmark:models
```

No model is automatically selected without measured results.

## Voice

Voice uses the same `RagPipeline` as text. Configure actual Arabic STT/TTS services:

```env
STT_SERVICE_URL=http://localhost:7001
TTS_SERVICE_URL=http://localhost:7002
```

If STT is not configured, voice fails explicitly; it no longer substitutes a hard-coded demonstration question. Voice recordings also have a configurable byte limit.

## Main configuration

See `.env.example`. Important legal-RAG settings include:

- `REQUIRE_VERIFIED_LEGAL_SOURCES`
- `RAG_CANDIDATE_K`
- `RAG_FINAL_K`
- `RAG_RRF_K`
- `RAG_MIN_RERANK_SCORE`
- `RAG_MAX_SEMANTIC_DISTANCE`
- `LEGAL_CHUNK_MAX_CHARS`
- `LEGAL_CHUNK_OVERLAP_CHARS`
- `PDF_MIN_TEXT_CHARS_PER_PAGE`
- `MAX_UPLOAD_BYTES`
- `RAG_DEBUG`

## Current external dependencies

Production legal accuracy still requires real, reviewed Egyptian traffic-law sources and verified version/amendment metadata. Scanned PDFs require an OCR service/process. Voice requires external STT/TTS endpoints. Model benchmarking requires the candidate Ollama models to be installed locally.
