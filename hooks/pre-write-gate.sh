#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
export ROOT_PATH="$ROOT"
HOOK_PAYLOAD="$(cat)"
export HOOK_PAYLOAD

python - <<'PY'
import json
import os
import sys
from pathlib import Path

root = Path(os.environ['ROOT_PATH']).resolve()
raw = os.environ.get('HOOK_PAYLOAD', '').strip()
if not raw:
    sys.exit(0)

try:
    payload = json.loads(raw)
except Exception:
    sys.exit(0)

tool_input = payload.get('tool_input') or {}
file_path = tool_input.get('file_path') or tool_input.get('path')
if not file_path:
    sys.exit(0)

try:
    target = Path(file_path).resolve()
except Exception:
    sys.exit(0)

legacy_roots = [
    (root / 'rules').resolve(),
    (root / 'agents').resolve(),
]
archive_root = (root / 'harness' / 'archive').resolve()
active_file = (root / 'harness' / 'ACTIVE_CHANGE').resolve()
changes_root = (root / 'harness' / 'changes').resolve()

governed_roots = [
    (root / 'reference-service' / 'src' / 'main').resolve(),
    (root / 'reference-service' / 'src' / 'test').resolve(),
    (root / 'reference-service' / 'openapi').resolve(),
]

for legacy in legacy_roots:
    try:
        target.relative_to(legacy)
    except Exception:
        continue
    print(f'BLOCK: 请不要继续把运行时规范写入历史目录 {legacy} 。当前自动加载层以 .claude/ 为准。', file=sys.stderr)
    sys.exit(2)

try:
    target.relative_to(archive_root)
    print('BLOCK: harness/archive/ 视为冻结历史，不允许直接编辑。', file=sys.stderr)
    sys.exit(2)
except Exception:
    pass

is_governed = False
for governed in governed_roots:
    try:
        target.relative_to(governed)
        is_governed = True
        break
    except Exception:
        continue

if is_governed:
    if not active_file.exists():
        print('BLOCK: 修改 reference-service 受治理路径前，必须先设置 harness/ACTIVE_CHANGE。', file=sys.stderr)
        sys.exit(2)

    change_id = active_file.read_text(encoding='utf-8').strip()
    if not change_id:
        print('BLOCK: harness/ACTIVE_CHANGE 为空。', file=sys.stderr)
        sys.exit(2)

    state_file = changes_root / change_id / 'state.json'
    if not state_file.exists():
        print(f'BLOCK: active change 缺少 state.json：{state_file}', file=sys.stderr)
        sys.exit(2)

    try:
        state = json.loads(state_file.read_text(encoding='utf-8'))
    except Exception:
        print(f'BLOCK: active change state.json 无法解析：{state_file}', file=sys.stderr)
        sys.exit(2)

    current_state = state.get('state')
    if current_state == 'DRAFT':
        print('BLOCK: 当前 active change 仍处于 DRAFT。请至少推进到 DISCOVERED 后再修改 reference-service。', file=sys.stderr)
        sys.exit(2)
    if current_state in {'ARCHIVED', 'REJECTED'}:
        print(f'BLOCK: 当前 active change 处于 {current_state}，不能继续修改 reference-service。', file=sys.stderr)
        sys.exit(2)

sys.exit(0)
PY
