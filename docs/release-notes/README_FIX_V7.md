# Paraphrase Isolation Fix v7

هذا الإصلاح يعالج حالة تغيّر صياغة السؤال مع بقاء المعنى، مثل:

- `مسكت الموبايل وأنا سايق المخالفة كام؟`
- `لو أنا ماسك التلفون وأنا سايق الغرامة كام؟`
- `التليفون في إيدي وأنا بسوق عليه كام؟`

## ما الذي تغير؟

1. تطبيع مرادفات عامية مصرية داخل طبقة المطابقة فقط (`موبايل/تليفون/تلفون/هاتف` وغيرها).
2. توسيع اكتشاف موضوع استخدام الهاتف في `queryProcessor` حتى يبني Retrieval Query صحيحًا.
3. Topic Guard أقوى: إذا كان سجل Atomic واحد هو المطابق بوضوح، يتم منع السجلات القانونية غير المرتبطة من الوصول إلى LLM.
4. Direct Evidence Answer يستخدم نفس المطابقة ويستخرج `## إجابة مختصرة` مباشرة.
5. Cache namespace أصبح `rag:v5` حتى لا تعود إجابات قديمة خاطئة.
6. Regression tests لصيغ متعددة للسؤال نفسه.

## التركيب

```bash
cd ~/Desktop/egypt-traffic-rag-bot
unzip -o ~/Downloads/egypt-traffic-rag-paraphrase-fix-v7-flat.zip -d .
docker compose build backend
docker compose up -d --force-recreate backend
```

لا تحتاج لإعادة `pnpm ingest` لأن هذا Patch لسلوك الاسترجاع/الفلترة وليس لمحتوى Chroma.

بعد التشغيل ابدأ محادثة جديدة وجرب نفس المعنى بصيغ مختلفة.
