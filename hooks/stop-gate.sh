#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

if [ ! -d "$ROOT/harness/changes" ]; then
  exit 0
fi

missing=0
while IFS= read -r state_file; do
  change_dir="$(dirname "$state_file")"
  if [ ! -f "$change_dir/validation.md" ]; then
    printf 'Stop gate 提醒：%s 缺少 validation.md，后续阶段应补齐统一验证证据。\n' "$change_dir" >&2
    missing=1
  fi
done < <(find "$ROOT/harness/changes" -mindepth 2 -maxdepth 2 -name state.json -type f 2>/dev/null || true)

if [ "$missing" -ne 0 ]; then
  printf 'Stop gate 当前仅提示，不阻断；后续阶段会升级为真正完成门禁。\n' >&2
fi
