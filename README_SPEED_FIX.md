# Speed fix for egypt-traffic-rag-bot-fixed-full

هذه النسخة تحافظ على RAG الحقيقي لكنها أسرع من fixed-full لأننا:

- أوقفنا semantic cache افتراضيًا لأنه كان يعمل embedding إضافي قبل Chroma.
- أصبح السؤال يعمل embedding مرة واحدة فقط داخل Chroma بدل مرتين.
- قللنا عدد المقاطع المسترجعة من 7 إلى 3.
- قللنا طول المقاطع داخل الـ prompt.
- قللنا طول إجابة الموديل من `num_predict=450` إلى `280`.
- أضفنا timeouts واضحة للـ Redis / Chroma / Ollama.
- أضفنا exact cache سريع: نفس السؤال بعد أول مرة يرد فورًا تقريبًا.

## التشغيل

```powershell
copy .env.example .env
docker compose down
docker compose up -d --build
```

تحميل الموديلات:

```powershell
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama pull bge-m3
```

بناء الفهرس:

```powershell
docker compose exec backend pnpm ingest
```

مراقبة السرعة:

```powershell
docker compose logs -f backend
```

المفروض ترى:

```text
[RAG] 0 exact cache start
[RAG] 1 chroma + memory start
[RAG] 2 chroma + memory done
[RAG] 3 llm start
[RAG] 4 llm done
```

## لو عايز أسرع أكثر

في `.env`:

```env
RAG_TOP_K=2
RAG_EXCERPT_CHARS=240
LLM_NUM_PREDICT=200
LLM_NUM_CTX=2048
```

ولو عايز أسرع جدًا على حساب قوة الإجابة:

```env
LLM_MODEL=qwen2.5:3b
```

ثم:

```powershell
docker compose exec ollama ollama pull qwen2.5:3b
docker compose up -d --build backend
```
