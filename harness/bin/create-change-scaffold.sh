#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
TEMPLATES="$ROOT/harness/templates"
CHANGES_DIR="$ROOT/harness/changes"

if [ "$#" -lt 1 ]; then
  printf '用法：%s <change-id> [owner] [tier] [topic]\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
OWNER="${2:-harness-governance}"
TIER="${3:-L1}"
TOPIC="${4:-}"
CHANGE_DIR="$CHANGES_DIR/$CHANGE_ID"

mkdir -p "$CHANGE_DIR/evidence" "$CHANGE_DIR/specs" "$CHANGE_DIR/reviews"

python - <<'PY' "$ROOT" "$CHANGE_ID" "$OWNER" "$TIER" "$TOPIC"
from pathlib import Path
import json
import sys

root = Path(sys.argv[1])
change_id = sys.argv[2]
owner = sys.argv[3]
tier = sys.argv[4]
topic = sys.argv[5] if len(sys.argv) > 5 else ''
change_dir = root / 'harness' / 'changes' / change_id
templates = root / 'harness' / 'templates'

# state.json
state_path = change_dir / 'state.json'
if not state_path.exists():
    data = json.loads((templates / 'state.json').read_text(encoding='utf-8'))
    data['changeId'] = change_id
    data['owner'] = owner
    data['tier'] = tier
    if topic:
        data['goal'] = topic
    state_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# markdown helpers
replacements = {
    '<change-id>': change_id,
    '<owner>': owner,
    '<change-id>': change_id,
}

for template_name, target_name in [
    ('change.md', 'change.md'),
    ('validation.md', 'validation.md'),
    ('tooling-evidence.md', 'evidence/tooling.md'),
]:
    target = change_dir / target_name
    if target.exists():
        continue
    text = (templates / template_name).read_text(encoding='utf-8')
    for old, new in replacements.items():
        text = text.replace(old, new)
    target.write_text(text, encoding='utf-8')

print(f'已创建或确认 change 资产目录：{change_dir}')
print(f'- {state_path.relative_to(root)}')
print(f'- {(change_dir / "change.md").relative_to(root)}')
print(f'- {(change_dir / "validation.md").relative_to(root)}')
print(f'- {(change_dir / "evidence/tooling.md").relative_to(root)}')
PY
