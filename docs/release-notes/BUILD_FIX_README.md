# Build fix

This patch fixes the TypeScript build errors observed with Node 22 / TypeScript 5.8 / ioredis 5 / LangChain Chroma while keeping strict compiler settings enabled.

Apply from the project root by overwriting the included files, then rebuild:

```bash
docker compose build --no-cache backend frontend
docker compose up -d
```

No `.env`, legal documents, uploads, or runtime data are included in this patch.
