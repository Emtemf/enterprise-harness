#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  printf '用法：%s <change-id> <evidence-ref>\n' "$0" >&2
  exit 1
fi

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
STATE_FILE="$ROOT/harness/changes/$1/state.json"
EVIDENCE_REF="$2"

python - <<'PY' "$STATE_FILE" "$EVIDENCE_REF"
import json, sys
from pathlib import Path
state_file = Path(sys.argv[1])
evidence_ref = sys.argv[2]
if not state_file.exists():
    print(f'未找到 state 文件：{state_file}', file=sys.stderr)
    sys.exit(1)
data = json.loads(state_file.read_text(encoding='utf-8'))
gates = data.setdefault('gates', {})
gates['redVerified'] = True
gates['redEvidenceRef'] = evidence_ref
state_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已标记 redVerified=true: {state_file}')
PY
