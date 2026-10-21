#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:-$HOME/Desktop/egypt-traffic-rag-bot}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$PROJECT_DIR/.voice-v11-backup-$STAMP"
BASE_IMAGE="egypt-traffic-rag-voice-base:v10.3-final"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

# First create a real timestamped archive of the user's CURRENT working project.
"$SCRIPT_DIR/snapshot_current_project.sh" "$PROJECT_DIR"

cd "$PROJECT_DIR"

# Freeze the known-working voice-service image. VoiceTut is built as a separate
# container on top of this image, so STT/Edge/Piper remain untouched and usable.
if ! docker image inspect "$BASE_IMAGE" >/dev/null 2>&1; then
  cid="$(docker compose ps -q voice-service 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    image_id="$(docker inspect -f '{{.Image}}' "$cid")"
    docker tag "$image_id" "$BASE_IMAGE"
    echo "Saved current working voice-service image as $BASE_IMAGE"
  elif docker image inspect egypt-traffic-rag-bot-voice-service:latest >/dev/null 2>&1; then
    docker tag egypt-traffic-rag-bot-voice-service:latest "$BASE_IMAGE"
    echo "Saved current local voice-service image as $BASE_IMAGE"
  else
    echo "ERROR: no working voice-service image was found." >&2
    echo "Start the current stable v10.3 voice-service, then run this installer again." >&2
    exit 1
  fi
else
  echo "Using existing frozen base image: $BASE_IMAGE"
fi

mkdir -p "$BACKUP_DIR"
files=(
  "voice-service/app.py"
  "voice-service/domain_context.py"
  "voice-service/transcript_correction.py"
  "voice-service/egyptian_speech.py"
  "voice-service/requirements-edge.txt"
  "voice-service/Dockerfile"
  "backend/src/index.ts"
  "backend/src/env.ts"
  "backend/src/voice/protocol.ts"
  "backend/src/voice/voiceGateway.ts"
  "backend/src/voice/stt.ts"
  "backend/src/voice/tts.ts"
  "frontend/components/chat/VoicePanel.tsx"
  "docker-compose.yml"
)

for rel in "${files[@]}"; do
  if [ -f "$PROJECT_DIR/$rel" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
    cp -a "$PROJECT_DIR/$rel" "$BACKUP_DIR/$rel"
  fi
  mkdir -p "$PROJECT_DIR/$(dirname "$rel")"
  cp -a "$SCRIPT_DIR/$rel" "$PROJECT_DIR/$rel"
done

if [ -d "$PROJECT_DIR/voicetut-service" ]; then
  cp -a "$PROJECT_DIR/voicetut-service" "$BACKUP_DIR/voicetut-service"
fi
rm -rf "$PROJECT_DIR/voicetut-service"
cp -a "$SCRIPT_DIR/voicetut-service" "$PROJECT_DIR/voicetut-service"

if [ -f "$PROJECT_DIR/.env" ]; then
  cp -a "$PROJECT_DIR/.env" "$BACKUP_DIR/.env"
else
  touch "$PROJECT_DIR/.env"
fi

set_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" "$PROJECT_DIR/.env"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$PROJECT_DIR/.env"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$PROJECT_DIR/.env"
  fi
}

# Preserve the final stable STT settings.
set_env WHISPER_MODEL small
set_env WHISPER_LANGUAGE ar
set_env WHISPER_CPU_THREADS 4
set_env WHISPER_COMPUTE_TYPE int8
set_env WHISPER_BEAM_SIZE 5
set_env WHISPER_BEST_OF 5
set_env WHISPER_PATIENCE 1.0
set_env WHISPER_VAD_MIN_SILENCE_MS 550
set_env WHISPER_VAD_SPEECH_PAD_MS 450
set_env WHISPER_HOTWORDS_MAX_CHARS 1200
set_env WHISPER_PROMPT_MAX_CHARS 100
set_env WHISPER_RETRY_LOW_CONFIDENCE true
set_env WHISPER_RETRY_CONFIDENCE_THRESHOLD 0.46
set_env WHISPER_RETRY_BEAM_SIZE 7
set_env STT_CORRECTION_ENABLED true
set_env STT_CORRECTION_MIN_SCORE 78
set_env STT_CORRECTION_MIN_MARGIN 4

# VoiceTut primary TTS.
set_env VOICETUT_MODEL mohammedaly22/VoiceTut-TTS
set_env VOICETUT_SPEAKER Mohamed
set_env VOICETUT_DEVICE cpu
set_env VOICETUT_DTYPE float32
set_env VOICETUT_NUM_STEP 16
set_env VOICETUT_GUIDANCE_SCALE 2.0
set_env VOICETUT_SPEED 1.0
set_env VOICETUT_NORMALIZE true
set_env VOICETUT_AUTO_PRELOAD true
set_env EGYPTIAN_SPOKEN_STYLE true
set_env TTS_SERVICE_URL http://voicetut-service:5010
set_env TTS_FALLBACK_SERVICE_URL http://voice-service:5005
set_env VOICE_TTS_TIMEOUT_MS 300000
set_env VOICE_MAX_TTS_CHARS 5000

# Keep the already-working Edge/Piper service as fallback.
set_env TTS_PROVIDER edge
set_env EDGE_TTS_VOICE ar-EG-ShakirNeural
set_env EDGE_TTS_RATE -4%
set_env EDGE_TTS_VOLUME +0%
set_env EDGE_TTS_PITCH +0Hz
set_env EDGE_TTS_FALLBACK_PIPER true
set_env PIPER_VOICE ar_JO-kareem-medium

printf '\nVoiceTut v11.1 files installed.\nPer-file backup: %s\nFrozen stable voice image: %s\n\n' "$BACKUP_DIR" "$BASE_IMAGE"
echo "NEXT: build VoiceTut only:"
echo "  cd '$PROJECT_DIR'"
echo "  bash '$SCRIPT_DIR/build_voicetut.sh' '$PROJECT_DIR'"
echo
echo "Then rebuild backend only (TTS routing changed):"
echo "  docker compose build backend"
echo "  docker compose up -d --force-recreate backend"
echo
echo "The existing voice-service remains the automatic Edge/Piper fallback."
