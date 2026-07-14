#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
CHANGES_DIR="$ROOT/harness/changes"

if [ "$#" -ne 5 ]; then
  printf '用法：%s <change-id> <api> <data> <architecture> <rule>\n' "$0" >&2
  printf '允许值：yes | no | unknown\n' >&2
  exit 1
fi

CHANGE_ID="$1"
API_IMPACT="$2"
DATA_IMPACT="$3"
ARCH_IMPACT="$4"
RULE_IMPACT="$5"
STATE_FILE="$CHANGES_DIR/$CHANGE_ID/state.json"

python - <<'PY' "$STATE_FILE" "$API_IMPACT" "$DATA_IMPACT" "$ARCH_IMPACT" "$RULE_IMPACT"
import json
import sys
from pathlib import Path

state_file = Path(sys.argv[1])
values = sys.argv[2:]
allowed = {'yes', 'no', 'unknown'}
if not state_file.exists():
    print(f'未找到 state 文件：{state_file}', file=sys.stderr)
    sys.exit(1)
if any(v not in allowed for v in values):
    print('impact 只允许 yes/no/unknown', file=sys.stderr)
    sys.exit(1)

data = json.loads(state_file.read_text(encoding='utf-8'))
data['impact'] = {
    'api': values[0],
    'data': values[1],
    'architecture': values[2],
    'rule': values[3],
}
state_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已更新 {state_file} 的 impact 字段')
PY
