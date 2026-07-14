#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
CHANGES_DIR="$ROOT/harness/changes"

if [ "$#" -lt 2 ]; then
  printf '用法：%s <change-id> <digest> [date]\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
DIGEST="$2"
VALIDATED_AT="${3:-$(date +%F)}"
STATE_FILE="$CHANGES_DIR/$CHANGE_ID/state.json"

python - <<'PY' "$STATE_FILE" "$DIGEST" "$VALIDATED_AT"
import json
import sys
from pathlib import Path

state_file = Path(sys.argv[1])
digest = sys.argv[2]
validated_at = sys.argv[3]
if not state_file.exists():
    print(f'未找到 state 文件：{state_file}', file=sys.stderr)
    sys.exit(1)

data = json.loads(state_file.read_text(encoding='utf-8'))
data['state'] = 'VALIDATED'
data['validation'] = {
    'status': 'fresh',
    'digest': digest,
    'validatedAt': validated_at,
}
state_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已将 {state_file} 标记为 VALIDATED')
PY
