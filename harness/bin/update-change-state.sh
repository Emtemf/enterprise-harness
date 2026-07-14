#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
CHANGES_DIR="$ROOT/harness/changes"

if [ "$#" -lt 2 ]; then
  printf '用法：%s <change-id> <state> [tier]\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
NEW_STATE="$2"
NEW_TIER="${3:-}"
STATE_FILE="$CHANGES_DIR/$CHANGE_ID/state.json"

if [ ! -f "$STATE_FILE" ]; then
  printf '未找到 state 文件：%s\n' "$STATE_FILE" >&2
  exit 1
fi

python - <<'PY' "$STATE_FILE" "$NEW_STATE" "$NEW_TIER"
import json
import sys
from pathlib import Path

state_file = Path(sys.argv[1])
new_state = sys.argv[2]
new_tier = sys.argv[3]
allowed_states = {
    'DRAFT', 'DISCOVERED', 'CHANGE_APPROVED', 'SPECIFIED', 'DESIGN_APPROVED',
    'TASKED', 'EXECUTING', 'REVIEWED', 'VALIDATED', 'ARCHIVED', 'BLOCKED', 'REJECTED'
}
allowed_tiers = {'L0', 'L1', 'L2', 'L3'}

if new_state not in allowed_states:
    print(f'非法 state: {new_state}', file=sys.stderr)
    sys.exit(1)
if new_tier and new_tier not in allowed_tiers:
    print(f'非法 tier: {new_tier}', file=sys.stderr)
    sys.exit(1)

data = json.loads(state_file.read_text(encoding='utf-8'))
data['state'] = new_state
if new_tier:
    data['tier'] = new_tier
state_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已更新 {state_file} → state={new_state}' + (f', tier={new_tier}' if new_tier else ''))
PY
