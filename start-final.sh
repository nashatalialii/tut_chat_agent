#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
echo "[1/4] Starting infrastructure..."
docker compose up -d redis chroma ollama

echo "[2/4] Ensuring Ollama models (downloads only if missing)..."
docker compose exec -T ollama ollama pull qwen2.5:3b || true
docker compose exec -T ollama ollama pull bge-m3 || true

echo "[3/4] Building app + VoiceTut services..."
docker compose build voice-service voicetut-service backend frontend

echo "[4/4] Starting complete VoiceTut system..."
docker compose up -d

echo "Open: http://localhost:3000"
echo "VoiceTut health: http://localhost:5010/healthz"
