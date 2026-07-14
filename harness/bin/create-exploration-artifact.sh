#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
TEMPLATES="$ROOT/harness/templates"
CHANGES_DIR="$ROOT/harness/changes"

if [ "$#" -lt 2 ]; then
  printf '用法：%s <change-id> <topic-kebab-case>\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
TOPIC="$2"
CHANGE_DIR="$CHANGES_DIR/$CHANGE_ID"
TARGET="$CHANGE_DIR/evidence/${TOPIC}-exploration.md"

if [ ! -d "$CHANGE_DIR" ]; then
  printf '未找到 change 目录：%s\n' "$CHANGE_DIR" >&2
  exit 1
fi

mkdir -p "$CHANGE_DIR/evidence"

if [ ! -f "$TARGET" ]; then
  cp "$TEMPLATES/exploration.md" "$TARGET"
fi

printf '已创建或确认 exploration 资产：%s\n' "$TARGET"
