# Voice Accuracy v9.3

This patch improves Egyptian Arabic voice-question recognition without changing the legal KB.

## What changed

1. Faster-Whisper default model: `large-v3-turbo` on CPU/int8.
2. Focused Whisper vocabulary: only traffic-law keywords are injected into decoding; full FAQ questions no longer bias the acoustic decoder.
3. Safe post-STT correction against the project's FAQ variants (352 phrases), with legal-safety guards for:
   - driver licence vs vehicle licence
   - injury vs death
   - no-accident qualifiers
   - hands-free vs handheld phone
   - front passenger vs driver
   - spoken negation
4. Low-confidence second decoding pass with a larger beam.
5. Very unclear audio is rejected instead of being sent to the legal RAG as a wrong question.
6. Browser recording starts immediately after microphone permission, before the WebSocket handshake, so the first spoken word is not lost.
7. Audio capture bitrate raised to 128 kbps Opus when supported.
8. Structured STT logs show raw transcript, corrected transcript, correction FAQ, score, confidence and retry usage.

## Install

From the project root, unzip this patch over the existing project, then:

```bash
bash apply_voice_accuracy_v9_3.sh .env
docker compose build --no-cache voice-service backend frontend
docker compose up -d --force-recreate voice-service backend frontend
```

The first run may download `large-v3-turbo`.

Check:

```bash
curl http://localhost:5005/healthz
```

Expected fields include:

```json
{
  "stt_model": "large-v3-turbo",
  "stt_post_correction": true,
  "stt_retry_low_confidence": true,
  "stt_faq_phrases": 352
}
```

## Debug one spoken question

After speaking once:

```bash
docker compose logs backend --tail=100 | grep -E "voice.stt_result|voice.stt_unclear"
```

`raw_text` is what Whisper heard. `final_text` is what is sent to the legal RAG.

## Performance fallback

If `large-v3-turbo` is too slow on the CPU, keep all v9.3 correction improvements but switch only:

```env
WHISPER_MODEL=medium
```

Then recreate the voice service.
