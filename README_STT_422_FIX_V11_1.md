# VoiceTut v11.1 — STT 422 hotfix

This build keeps VoiceTut v11 unchanged and hardens the existing Whisper STT path.

## Fixes

- If the first Faster-Whisper pass returns no speech because VAD filtered a short/quiet browser recording, retry once with VAD disabled and no prompt before returning HTTP 422.
- Preserve the normal VAD-enabled fast path for ordinary recordings.
- Backend now includes the STT response body in errors, so a future 422 shows its actual reason instead of only `STT service failed: 422`.
- Existing position-449 safeguard, FAQ correction, VoiceTut routing, Edge fallback and Piper fallback remain in place.

## Rebuild after install

```bash
cd ~/Desktop/egypt-traffic-rag-bot
docker compose build voice-service backend
docker compose up -d --force-recreate voice-service backend
```
