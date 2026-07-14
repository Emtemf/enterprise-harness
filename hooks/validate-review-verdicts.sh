#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

python - <<'PY'
import json
import sys
from pathlib import Path

root = Path('/home/wula/IdeaProjects/sdd')
paths = []
paths.extend((root / 'harness' / 'changes').glob('*/reviews/*.json'))
paths.append(root / 'harness' / 'templates' / 'review-verdict.json')
allowed = {'pass', 'block', 'advisory'}
errors = []

for path in paths:
    if not path.exists():
        continue
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'{path}: invalid JSON ({exc})')
        continue
    for key in ['changeId', 'reviewerId', 'verdict', 'findings', 'evidence']:
        if key not in data:
            errors.append(f'{path}: missing required field {key}')
    if data.get('verdict') not in allowed:
        errors.append(f"{path}: invalid verdict {data.get('verdict')}")

if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)

print('Review verdict validation passed.')
PY
