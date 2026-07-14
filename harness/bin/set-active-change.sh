#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
CHANGES_DIR="$ROOT/harness/changes"
ACTIVE_FILE="$ROOT/harness/ACTIVE_CHANGE"

if [ "$#" -lt 1 ]; then
  printf '用法：%s <change-id>\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
CHANGE_DIR="$CHANGES_DIR/$CHANGE_ID"
STATE_FILE="$CHANGE_DIR/state.json"

if [ ! -d "$CHANGE_DIR" ]; then
  printf '未找到 change 目录：%s\n' "$CHANGE_DIR" >&2
  exit 1
fi

if [ ! -f "$STATE_FILE" ]; then
  printf '未找到 state 文件：%s\n' "$STATE_FILE" >&2
  exit 1
fi

printf '%s\n' "$CHANGE_ID" > "$ACTIVE_FILE"
printf '已设置 active change：%s\n' "$CHANGE_ID"
