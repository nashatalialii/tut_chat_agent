# Universal Query Fix v8.1

This patch fixes the two failing tests reported after v8:

1. `license action uses only the explicit additional penalty field`
   - Preserves the historical `حسب الملخص،` prefix only for legacy/unverified summary records.
   - Verified/official KB records remain clean and are not mislabeled as summaries.

2. `all canonical FAQ variants resolve to one of their declared legal references`
   - Adds literal exact-match priority before fuzzy FAQ scoring.
   - Adds unique normalized exact-match priority.
   - Keeps `مركبة`, `قيادة`, and `سائق` as retrieval discriminator tokens so vehicle-license and driver-license questions do not collapse into the same intent.

Cache namespace is bumped from `rag:v6` to `rag:v7` to avoid serving answers cached under the previous matcher behavior.

After applying:

```bash
cd ~/Desktop/egypt-traffic-rag-bot
docker compose build backend
docker compose up -d --force-recreate backend
docker compose exec backend pnpm test
```

No re-ingestion is required because this patch changes query-time matching, not indexed legal content.
