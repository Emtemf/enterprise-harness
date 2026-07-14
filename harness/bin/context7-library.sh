#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf '用法：%s <library-name> <query>\n' "$0" >&2
  exit 1
fi

LIBRARY_NAME="$1"
shift
QUERY="$*"

npx -y ctx7 library "$LIBRARY_NAME" "$QUERY"
