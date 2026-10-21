# Voice v10.1 - إصلاح Build الخاص بـ edge-tts

سبب فشل v10 كان أن `edge-tts>=7,<8` جعل pip يجرب عدة إصدارات ثم يدخل في dependency backtracking حول `aiohttp`.

v10.1 يحافظ على كل وظائف v10 كما هي، ويغيّر فقط طريقة تثبيت Python packages:

- تثبيت إصدارات مباشرة ومثبتة deterministic versions.
- تثبيت متطلبات edge-tts الأربعة صراحة: `aiohttp`, `certifi`, `tabulate`, `typing-extensions`.
- تثبيت `edge-tts==7.2.8` بعد ذلك باستخدام `--no-deps` حتى لا يعيد pip حل dependency graph.
- تفعيل BuildKit pip cache لتقليل إعادة التنزيل في المحاولات اللاحقة.
- الإبقاء على `--default-timeout=300 --retries 10 --prefer-binary` للاتصالات البطيئة.

## بعد التثبيت

```bash
cd ~/Desktop/egypt-traffic-rag-bot
docker compose build --progress=plain voice-service backend frontend
docker compose up -d --force-recreate voice-service backend frontend
```

ثم:

```bash
curl -s http://localhost:5005/healthz | python3 -m json.tool
```

واختبار TTS المصري:

```bash
curl -s -X POST http://localhost:5005/synthesize \
  -H 'content-type: application/json' \
  -d '{"text":"بص، أنا جاهز أجاوبك عن مخالفات المرور بالمصري.","voice":"ar-EG-ShakirNeural"}' \
  --output /tmp/egypt-voice.mp3
xdg-open /tmp/egypt-voice.mp3
```
