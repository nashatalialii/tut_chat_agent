# Voice Input + Voice Answer v9

This patch completes the existing voice path:

Microphone -> local Faster-Whisper STT -> existing legal RAG -> local Piper TTS -> browser audio playback.

## What changed

- Added `voice-service/` Docker service.
- STT runs locally on CPU with Faster-Whisper (`small`, `int8` by default).
- TTS runs locally with Piper Arabic voice (`ar_JO-kareem-medium`).
- The existing `/voice` WebSocket still uses the same RAG pipeline as text chat.
- Frontend now sends the complete MediaRecorder blob before `commit`, preventing truncated recordings.
- Audio output is played with an unlocked Web Audio context, reducing autoplay failures.
- The interrupt button stops recording, generation, and current audio playback.

## First run

The first voice-service startup downloads the Whisper and Piper models into the persistent Docker volume `voice-models`. This can take several minutes depending on the connection. Later starts reuse the downloaded models.

Build/start:

```bash
docker compose up -d --build
```

Watch voice model startup:

```bash
docker compose logs -f voice-service
```

Health check:

```bash
curl http://localhost:5005/healthz
```

Expected once ready:

```json
{"ok":true,"stt":"faster-whisper","tts":"piper","language":"ar"}
```

Then open http://localhost:3000, allow microphone access, press `تحدث الآن`, speak, and press `إيقاف وإرسال`.

## CPU tuning

Default:

```env
WHISPER_MODEL=small
WHISPER_CPU_THREADS=4
WHISPER_COMPUTE_TYPE=int8
PIPER_VOICE=ar_JO-kareem-medium
```

For a slower CPU, use `base` for faster STT:

```env
WHISPER_MODEL=base
```

For better Arabic recognition on a stronger CPU, keep `small`.

Set `WHISPER_CPU_THREADS` approximately to the number of physical CPU cores available to Docker.

## Notes

- The voice service is local; no paid STT/TTS API key is required.
- Piper currently provides an Arabic `ar_JO` voice rather than a dedicated Egyptian Arabic voice. The text answer can still be Egyptian Arabic; the synthesized accent is the Piper voice's accent.
- Text chat continues to work even while the voice model is still loading.
