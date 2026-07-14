#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
ACTIVE_FILE="$ROOT/harness/ACTIVE_CHANGE"

if [ ! -f "$ACTIVE_FILE" ]; then
  printf '当前没有 active change。\n' >&2
  exit 1
fi

CHANGE_ID="$(cat "$ACTIVE_FILE")"
printf '%s\n' "$CHANGE_ID"
