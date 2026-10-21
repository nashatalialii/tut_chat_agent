# Dynamic KB Matching Fix v6

هذا الإصلاح مخصص لقاعدة المعرفة الموثقة الكبيرة (100+ سجل).

## ما الذي يصلحه؟
- يمنع تمرير مخالفات غير مرتبطة عندما يكون السجل الصحيح موجودًا.
- يضيف دعمًا صريحًا لحزام الأمان والهاتف في topic guard القديم.
- يجعل المطابقة ديناميكية من عنوان السجل + الفئة/المخالفة + صيغ الأسئلة الشائعة داخل كل ملف.
- يجعل Direct Answer يقرأ الصيغة الجديدة `## إجابة مختصرة`.
- لا يعطي Direct Answer للسجلات الموسومة `requires_case_assessment`.
- يرفع namespace الكاش إلى `rag:v4` لتجاهل الإجابات القديمة الخاطئة.

## التثبيت
```bash
cd ~/Desktop/egypt-traffic-rag-bot
unzip -o ~/Downloads/egypt-traffic-rag-dynamic-kb-fix-v6-flat.zip -d .

grep -n "recordQueryMatchScore" backend/src/rag/topicMatcher.ts
grep -n "sectionText" backend/src/rag/directEvidenceAnswer.ts
grep -n "rag:v4:" backend/src/redis/cache.ts

docker compose build backend
docker compose up -d --force-recreate backend
```

لا تحتاج لإعادة `pnpm ingest` لهذا patch إذا كانت قاعدة المعرفة الجديدة مفهرسة بالفعل.

بعدها افتح محادثة جديدة واختبر:
- لو مش رابط الحزام الغرامة كام؟
- مسكت الموبايل وأنا سايق المخالفة كام؟
- طفاية الحريق مش موجودة الغرامة كام؟
- عملت حادث واتصاب شخص، العقوبة إيه؟

للتأكد من direct answer:
```bash
docker compose logs backend --tail=150 | grep rag.direct_answer
```
