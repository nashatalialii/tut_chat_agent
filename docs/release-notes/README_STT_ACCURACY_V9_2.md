# Voice STT Accuracy Fix v9.2

يرفع دقة التعرف على العامية المصرية في مشروع المرور من خلال:

- Faster-Whisper `medium` افتراضيًا بدل `small`.
- Beam search بقيمة 5 بدل 1.
- Initial prompt عربي خاص بقانون المرور.
- Hotwords يتم توليدها آليًا من `data/faq/*.jsonl` في المشروع.
- VAD أقل عدوانية حتى لا يقطع آخر/أول الكلمات.
- تحسين تسجيل المتصفح: echo cancellation + noise suppression + auto gain + mono.
- لا يتم تعديل النص قانونيًا داخل خدمة الصوت؛ الخدمة تحسن التعرف فقط ثم ترسل النص لنفس RAG.

## التثبيت

```bash
cd ~/Desktop/egypt-traffic-rag-bot
unzip -o ~/Downloads/egypt-traffic-rag-voice-stt-accuracy-v9.2-flat.zip -d .
docker compose build --no-cache voice-service frontend
docker compose up -d --force-recreate voice-service frontend backend
```

أول تشغيل قد ينزل موديل `medium`. تابع:

```bash
docker compose logs -f voice-service
```

ثم تحقق:

```bash
curl http://localhost:5005/healthz
```

ينبغي أن ترى `stt_model=medium`, `stt_beam_size=5`, وعددًا أكبر من صفر في `stt_domain_terms`.

## لو الجهاز بطيء

يمكن الرجوع إلى small مع بقاء كل تحسينات الـprompt/hotwords/beam:

```env
WHISPER_MODEL=small
WHISPER_BEAM_SIZE=5
WHISPER_BEST_OF=5
```

ثم:

```bash
docker compose up -d --force-recreate voice-service
```

## لو تريد أقصى دقة

ابدأ بـ`medium`. لا تستخدم تصحيحًا آليًا عدوانيًا للنص في مجال قانوني؛ تحسين STT + قاموس المجال أكثر أمانًا من استبدال الكلمات بعد التعرف.
