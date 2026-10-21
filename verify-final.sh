#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "=== compose ==="
docker compose ps
echo "=== backend ==="
curl -fsS http://localhost:4000/healthz || true
echo
echo "=== STT / Edge fallback ==="
curl -fsS http://localhost:5005/healthz || true
echo
if grep -q '^  voicetut-service:' docker-compose.yml; then
  echo "=== VoiceTut ==="
  curl -fsS http://localhost:5010/healthz || true
  echo
fi
