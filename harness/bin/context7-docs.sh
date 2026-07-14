#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf '用法：%s <library-id> <query>\n' "$0" >&2
  exit 1
fi

LIBRARY_ID="$1"
shift
QUERY="$*"

npx -y ctx7 docs "$LIBRARY_ID" "$QUERY"
