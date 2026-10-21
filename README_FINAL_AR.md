# النسخة النهائية الكاملة - VoiceTut Egyptian Voice

هذه ليست حزمة صوت فقط. هذا مجلد النظام كاملًا: frontend + backend + RAG + قاعدة المعرفة + Redis/Chroma/Ollama + Whisper STT + تصحيح FAQ + VoiceTut TTS + Edge/Piper fallback.

## الحالة النهائية
- LLM: qwen2.5:3b
- Embedding: bge-m3
- STT: faster-whisper small / int8 / Arabic
- STT correction + retry + إصلاح 422 للتسجيلات القصيرة/الهادئة
- RAG: جميع إصلاحات الدقة حتى Universal v8.1 وما بعدها
- TTS الأساسي: VoiceTut / speaker Mohamed / CPU / num_step=16
- TTS fallback: Edge ar-EG-ShakirNeural ثم Piper
- الواجهة: WebSocket voice path /voice
- قاعدة المعرفة القانونية موجودة داخل data/legal
- المصادر المرجعية محفوظة داخل data/reference_sources

## التشغيل
```bash
cd ~/Desktop/egypt-traffic-rag-system-voicetut-final-v11.1
bash start-final.sh
```
ثم افتح http://localhost:3000

## الفحص
```bash
bash verify-final.sh
```

## الإيقاف قبل تشغيل نسخة Edge
```bash
bash stop-final.sh
```

## ملاحظة الجهاز
VoiceTut أثقل من Edge. الإعداد الافتراضي هنا CPU وnum_step=16 بما يتناسب مع تجربة الجهاز الحالية، مع fallback تلقائي للصوت القديم إذا VoiceTut لم يكن جاهزًا أو فشل.
