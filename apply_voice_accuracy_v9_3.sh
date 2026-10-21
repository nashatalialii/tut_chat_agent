#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  touch "$ENV_FILE"
fi
cp -a "$ENV_FILE" "${ENV_FILE}.before-voice-v9.3.bak"

set_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

set_env WHISPER_MODEL large-v3-turbo
set_env WHISPER_LANGUAGE ar
set_env WHISPER_COMPUTE_TYPE int8
set_env WHISPER_BEAM_SIZE 5
set_env WHISPER_BEST_OF 5
set_env WHISPER_PATIENCE 1.2
set_env WHISPER_VAD_MIN_SILENCE_MS 550
set_env WHISPER_VAD_SPEECH_PAD_MS 450
set_env WHISPER_HOTWORDS_MAX_CHARS 1200
set_env WHISPER_PROMPT_MAX_CHARS 900
set_env WHISPER_RETRY_LOW_CONFIDENCE true
set_env WHISPER_RETRY_CONFIDENCE_THRESHOLD 0.46
set_env WHISPER_RETRY_BEAM_SIZE 8
set_env STT_CORRECTION_ENABLED true
set_env STT_CORRECTION_MIN_SCORE 78
set_env STT_CORRECTION_MIN_MARGIN 4

echo "Voice accuracy v9.3 environment settings applied to $ENV_FILE"
echo "Backup: ${ENV_FILE}.before-voice-v9.3.bak"
