# Voice WebSocket Fix v9.1

This patch fixes the browser error shown after pressing "تحدث الآن" when the local voice service is healthy but the browser cannot open `ws://localhost:4000/voice`.

## Root cause

The backend created two separate `WebSocketServer` instances attached directly to the same HTTP server (`/trpc` and `/voice`). `ws` documents the robust multi-WebSocket-server pattern as `noServer: true` with one HTTP `upgrade` router. v9.1 uses that design.

## Install

```bash
cd ~/Desktop/egypt-traffic-rag-bot
unzip -o ~/Downloads/egypt-traffic-rag-voice-v9.1-ws-fix-flat.zip -d .
docker compose build backend frontend
docker compose up -d --force-recreate backend frontend
```

No re-ingestion is needed.

## Check

```bash
curl http://localhost:4000/healthz
curl http://localhost:4000/voice-healthz
docker compose logs backend --tail=100 | grep -E 'backend.started|voice.connected|voice.recording_started|voice.audio_committed|voice.transcribed|websocket'
```

Then hard-refresh `http://localhost:3000` and press "تحدث الآن". The status should become "اسمعك الآن...".
