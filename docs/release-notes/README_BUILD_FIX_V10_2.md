# Voice v10.2 - Incremental Egyptian TTS build

This release fixes the long PyPI rebuild problem seen in v10/v10.1.

## What changed

v10.1 rebuilt the complete Python voice image and therefore downloaded large
packages such as ctranslate2/faster-whisper/piper/uvicorn again. With a slow or
unstable PyPI connection this could take 40+ minutes and then fail.

v10.2 snapshots the already-working local voice-service image as:

`egypt-traffic-rag-voice-base:v9.3`

and builds on top of it. Docker downloads ONLY the Egyptian Edge-TTS additions.
All Edge-TTS packages are exact-pinned and installed with `--no-deps`, so pip
cannot perform dependency-resolver backtracking.

The STT/RAG/FAQ correction/Piper fallback/position-449 fixes are preserved.

## Install

```bash
cd ~/Downloads
unzip egypt-traffic-rag-voice-egyptian-v10.2-flat.zip
cd egypt-traffic-rag-voice-egyptian-v10.2
bash install_to_project.sh ~/Desktop/egypt-traffic-rag-bot
```

Then:

```bash
cd ~/Desktop/egypt-traffic-rag-bot
docker compose build --progress=plain voice-service
docker compose up -d --no-deps --force-recreate voice-service
```

Verify:

```bash
curl -s http://localhost:5005/healthz | python3 -m json.tool
```

Then build only the TypeScript services:

```bash
docker compose build backend frontend
docker compose up -d --force-recreate backend frontend
```

## Expected voice

Default: `ar-EG-ShakirNeural`.
Alternative: `ar-EG-SalmaNeural`.

Edge TTS is no-key but needs internet at synthesis time. Piper remains the
fallback when the online Egyptian voice cannot be reached.
