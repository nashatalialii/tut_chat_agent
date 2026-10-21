#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-$HOME/Desktop/egypt-traffic-rag-bot}"
DEST_DIR="${2:-$HOME/Desktop/egypt-traffic-rag-snapshots}"
STAMP="$(date +%Y%m%d-%H%M%S)"
NAME="egypt-traffic-rag-final-v10.3-$STAMP"
ARCHIVE="$DEST_DIR/$NAME.tar.gz"
MANIFEST="$DEST_DIR/$NAME.manifest.txt"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "Project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"

# This snapshot keeps source, data/legal KB, FAQ, .env, compose files and configs.
# It excludes generated caches/build outputs only. Docker named volumes/models are
# outside the project directory and are intentionally not embedded in this archive.
tar -C "$(dirname "$PROJECT_DIR")" \
  --exclude='*/node_modules' \
  --exclude='*/.next' \
  --exclude='*/dist' \
  --exclude='*/build' \
  --exclude='*/.turbo' \
  --exclude='*/__pycache__' \
  --exclude='*/.pytest_cache' \
  --exclude='*.pyc' \
  --exclude='.voice-*-backup-*' \
  -czf "$ARCHIVE" "$(basename "$PROJECT_DIR")"

{
  echo "Snapshot: $NAME"
  echo "Created: $(date -Is)"
  echo "Source: $PROJECT_DIR"
  echo "Archive: $ARCHIVE"
  echo
  sha256sum "$ARCHIVE"
  echo
  echo "Top-level files:"
  find "$PROJECT_DIR" -maxdepth 2 -type f | sort
} > "$MANIFEST"

echo "FINAL SNAPSHOT CREATED"
echo "Archive:  $ARCHIVE"
echo "Manifest: $MANIFEST"
sha256sum "$ARCHIVE"
