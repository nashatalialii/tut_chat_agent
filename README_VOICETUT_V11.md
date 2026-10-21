# Egypt Traffic RAG - VoiceTut v11

This branch starts from the final working v10.3 state and changes only the primary TTS path.
The stable STT/RAG/Edge/Piper path is kept intact as fallback.

## Architecture

```text
Microphone
  -> stable voice-service / Faster-Whisper small + FAQ correction
  -> legal RAG (unchanged)
  -> backend TTS router
       -> VoiceTut local Egyptian TTS (primary)
       -> Edge ar-EG / Piper (automatic fallback)
```

VoiceTut is Egyptian-first and its official package exposes built-in Egyptian speakers,
Egyptian text normalization and `language="arz"`. v11 defaults to the `Mohamed` built-in voice.

## Important for this machine

The project is CPU-only with about 7 GB RAM. VoiceTut's public model repository is large and
its published performance numbers are GPU measurements. For that reason v11 isolates VoiceTut
in a separate container and never removes the working Edge/Piper path.

- `VOICETUT_DEVICE=cpu`
- `VOICETUT_DTYPE=float32`
- `VOICETUT_NUM_STEP=16` for lower CPU latency
- background preload is enabled
- while VoiceTut is downloading/loading, the backend immediately falls back to Edge/Piper

At least 15 GB of free disk is recommended before the first local model download.

## Install

```bash
cd ~/Downloads
unzip egypt-traffic-rag-voicetut-v11.zip
cd egypt-traffic-rag-voicetut-v11
bash install_to_project.sh ~/Desktop/egypt-traffic-rag-bot
```

The installer first creates an exact timestamped snapshot of the current project under:

```text
~/Desktop/egypt-traffic-rag-snapshots/
```

Then build the new VoiceTut sidecar:

```bash
cd ~/Desktop/egypt-traffic-rag-bot
bash ~/Downloads/egypt-traffic-rag-voicetut-v11/build_voicetut.sh ~/Desktop/egypt-traffic-rag-bot
```

Rebuild only the backend because the TTS route changed:

```bash
docker compose build backend
docker compose up -d --force-recreate backend
```

No RAG ingestion is required.

## Status

```bash
curl -s http://localhost:5010/healthz | python3 -m json.tool
```

During the first download/load you may see:

```json
{"model_loaded": false, "model_loading": true}
```

The chatbot remains usable because it falls back to the existing Edge/Piper service.
When VoiceTut is ready:

```json
{"model_loaded": true, "speaker": "Mohamed", "device": "cpu"}
```

Follow model download/loading:

```bash
docker compose logs -f voicetut-service
```

## Direct test

```bash
curl -s -X POST http://localhost:5010/synthesize \
  -H 'content-type: application/json' \
  -d '{"text":"بص، لو ماسك الموبايل وإنت سايق، هقولك الغرامة حسب المرجع.","voice":"Mohamed"}' \
  --output /tmp/voicetut-test.wav

mpv /tmp/voicetut-test.wav
```

## Change speaker

The official VoiceTut model includes built-in voices such as `Mohamed`, `Sayed`, `Ahmed`,
`Omar`, `Asmaa`, `Sarah`, `Yasmin` and others.

```bash
sed -i 's/^VOICETUT_SPEAKER=.*/VOICETUT_SPEAKER=Sayed/' .env
docker compose up -d --force-recreate voicetut-service
```

List the voices after the model is loaded:

```bash
curl -s http://localhost:5010/voices | python3 -m json.tool
```

## Rollback

The installer's full pre-v11 snapshot is the safest rollback. It also stores a per-file backup
inside the project (`.voice-v11-backup-<timestamp>`). The existing `voice-service` is never
replaced by VoiceTut; it remains the stable fallback.
