#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/Desktop/egypt-traffic-rag-bot}"
cd "$PROJECT_DIR"

if ! docker image inspect egypt-traffic-rag-voice-base:v10.3-final >/dev/null 2>&1; then
  echo "Missing local base image egypt-traffic-rag-voice-base:v10.3-final" >&2
  echo "Run the v11 installer first." >&2
  exit 1
fi

avail_kb="$(df -Pk "$PROJECT_DIR" | awk 'NR==2 {print $4}')"
if [ "${avail_kb:-0}" -lt 12582912 ]; then
  echo "WARNING: less than 12 GiB free disk is available." >&2
  echo "VoiceTut's model repository is large; 15+ GiB free is recommended." >&2
fi

attempt=1
max_attempts=4
while [ "$attempt" -le "$max_attempts" ]; do
  echo "VoiceTut image build attempt $attempt/$max_attempts"
  if docker compose --progress=plain build voicetut-service; then
    break
  fi
  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "VoiceTut build failed after $max_attempts attempts." >&2
    exit 1
  fi
  echo "Build failed, retrying in 10 seconds. BuildKit/pip cache will be reused where available."
  sleep 10
  attempt=$((attempt + 1))
done

docker compose up -d --no-deps --force-recreate voicetut-service

echo
echo "VoiceTut container started. It can download/load the model in the background."
echo "Check: curl -s http://localhost:5010/healthz | python3 -m json.tool"
echo "Follow: docker compose logs -f voicetut-service"
