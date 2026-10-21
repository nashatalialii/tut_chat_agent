# Direct Answer Fix v5

This patch is FLAT: extract it directly into the repository root.

Changes:
- Adds deterministic direct answers from the matching atomic evidence record.
- Logs `rag.direct_answer` when used.
- Bumps RAG cache namespace from v2 to v3 so old cached LLM answers are ignored.

Install from repository root:

```bash
unzip -o ~/Downloads/egypt-traffic-rag-direct-answer-fix-v5-flat.zip -d .
grep -n "rag.direct_answer" backend/src/rag/pipeline.ts
grep -n "rag:v3:" backend/src/redis/cache.ts
docker compose build backend
docker compose up -d --force-recreate backend
```

No re-ingestion is required if Atomic v4 is already indexed.
