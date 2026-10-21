# Egypt Traffic RAG Voice v10

الهدف: الحفاظ على جميع إصلاحات Voice v9.x الحالية مع إضافة صوت مصري مجاني وسريع مناسب لجهاز CPU/RAM محدود.

## التصميم

```text
Microphone
  -> WebSocket /voice
  -> Faster-Whisper small INT8
  -> low-confidence retry
  -> FAQ transcript correction
  -> existing legal RAG
  -> original legal text shown in UI
  -> spoken-only Egyptian adapter
  -> edge-tts ar-EG-ShakirNeural / ar-EG-SalmaNeural
  -> MP3 to browser
  -> Piper ar_JO fallback if Edge TTS fails
```

## ضمان عدم العبث بالمعلومة القانونية

`egyptian_speech.py` يعمل على نسخة الصوت فقط. لا يغير رسالة الـRAG المخزنة أو المعروضة، ولا يغير citations. التحويل محافظ ويقتصر على روابط لغوية مثل `يمكنك -> تقدر` و`إذا -> لو`. لا توجد قواعد تغير الأرقام أو نطاقات الغرامات أو أرقام المواد أو Reference IDs.

## متطلبات الشبكة

STT وRAG وPiper محليون. الصوت المصري عبر edge-tts يحتاج إنترنت. لو الإنترنت غير متاح و`EDGE_TTS_FALLBACK_PIPER=true` يرجع النظام تلقائيًا للصوت المحلي القديم بدل فقدان الإجابة الصوتية بالكامل.
