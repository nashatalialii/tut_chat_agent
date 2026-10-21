# تثبيت VoiceTut v11

هذه النسخة تبدأ من الحالة المستقرة الحالية ولا تلغيها. قبل أي تعديل يقوم السكربت بإنشاء Snapshot كامل للمشروع الحالي، ثم يضيف خدمة VoiceTut منفصلة. خدمة الصوت الحالية (Whisper + Edge/Piper) تظل موجودة كـ fallback.

## 1) فك الملف

```bash
cd ~/Downloads
unzip egypt-traffic-rag-voicetut-v11.zip
cd egypt-traffic-rag-voicetut-v11
```

## 2) احفظ الحالة الحالية وثبّت ملفات v11

```bash
bash install_to_project.sh ~/Desktop/egypt-traffic-rag-bot
```

ستجد النسخة النهائية السابقة في:

```text
~/Desktop/egypt-traffic-rag-snapshots/
```

## 3) ابنِ VoiceTut فقط

```bash
cd ~/Desktop/egypt-traffic-rag-bot
bash ~/Downloads/egypt-traffic-rag-voicetut-v11/build_voicetut.sh ~/Desktop/egypt-traffic-rag-bot
```

## 4) ابنِ backend فقط

```bash
docker compose build backend
docker compose up -d --force-recreate backend
```

لا تعمل ingest؛ ملفات القانون وChroma لم تتغير.

## 5) راقب VoiceTut

```bash
curl -s http://localhost:5010/healthz | python3 -m json.tool
```

أول مرة سيبدأ تنزيل/تحميل الموديل في الخلفية. أثناء ذلك سيظل الشات يستخدم Edge/Piper تلقائيًا.

```bash
docker compose logs -f voicetut-service
```

عندما ترى `model_loaded: true` أصبح VoiceTut هو الصوت الأساسي.
