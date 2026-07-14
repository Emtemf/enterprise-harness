#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
STATE_FILE="$ROOT/harness/changes/$1/state.json"

python - <<'PY' "$STATE_FILE"
import json, sys
from pathlib import Path
state_file = Path(sys.argv[1])
if not state_file.exists():
    print(f'未找到 state 文件：{state_file}', file=sys.stderr)
    sys.exit(1)
data = json.loads(state_file.read_text(encoding='utf-8'))
validation = data.setdefault('validation', {})
validation['status'] = 'stale'
state_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已标记 validation.status=stale: {state_file}')
PY
