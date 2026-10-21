# Voice Egyptian v10.3 - typing_extensions compatibility fix

This release keeps all v10.2 voice/STT/RAG fixes and changes only dependency compatibility for the incremental Egyptian Edge-TTS layer.

## Fixed
- `typing-extensions` is pinned to `4.16.0` instead of `4.12.2`.
- This provides the lowercase `typing_extensions.sentinel` symbol required by the AnyIO version already present in the working base image.
- Removed the external `# syntax=docker/dockerfile:1.7` directive so Docker does not need to contact Docker Hub just to resolve the Dockerfile frontend.
- Build now performs an import sanity check for `fastapi`, `anyio`, `aiohttp`, `edge_tts`, and `typing_extensions.sentinel` before producing the image.

## Install
```bash
cd ~/Downloads
unzip egypt-traffic-rag-voice-egyptian-v10.3-flat.zip
cd egypt-traffic-rag-voice-egyptian-v10.3
bash install_to_project.sh ~/Desktop/egypt-traffic-rag-bot

cd ~/Desktop/egypt-traffic-rag-bot
docker compose --progress=plain build voice-service
docker compose up -d --no-deps --force-recreate voice-service
```

## Verify
```bash
docker compose exec voice-service python -c "from typing_extensions import sentinel; import fastapi, anyio, edge_tts; print('VOICE DEPS OK')"
curl -s http://localhost:5005/healthz | python3 -m json.tool
```
