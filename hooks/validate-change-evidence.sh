#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

python - <<'PY'
import sys
from pathlib import Path

root = Path('/home/wula/IdeaProjects/sdd')
changes_dir = root / 'harness' / 'changes'
errors = []

if not changes_dir.exists():
    print('Change evidence validation skipped: no harness/changes directory found.')
    sys.exit(0)

for change_dir in changes_dir.iterdir():
    if not change_dir.is_dir():
        continue

    # 兼容历史 MVP change 样例：旧目录使用 proposal.md 等资产，不强制要求新 state/change/validation 三件套。
    legacy_markers = [change_dir / 'proposal.md', change_dir / 'tasks.md']
    if any(path.exists() for path in legacy_markers) and not (change_dir / 'state.json').exists():
        continue

    required = [
        change_dir / 'state.json',
        change_dir / 'change.md',
        change_dir / 'validation.md',
        change_dir / 'evidence' / 'tooling.md',
    ]
    for path in required:
        if not path.exists():
            errors.append(f'{change_dir}: missing required artifact {path.name}')

if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)

print('Change evidence validation passed.')
PY
