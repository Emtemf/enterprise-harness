#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

python - <<'PY'
import json
import sys
from pathlib import Path

root = Path('/home/wula/IdeaProjects/sdd')
changes_dir = root / 'harness' / 'changes'
allowed_tiers = {'L0', 'L1', 'L2', 'L3'}
allowed_states = {
    'DRAFT', 'DISCOVERED', 'CHANGE_APPROVED', 'SPECIFIED', 'DESIGN_APPROVED',
    'TASKED', 'EXECUTING', 'REVIEWED', 'VALIDATED', 'ARCHIVED', 'BLOCKED', 'REJECTED'
}
allowed_impact = {'yes', 'no', 'unknown'}
allowed_validation = {'missing', 'fresh', 'stale'}
errors = []

if not changes_dir.exists():
    print('Artifact state validation skipped: no harness/changes directory found.')
    sys.exit(0)

for state_file in changes_dir.glob('*/state.json'):
    try:
        data = json.loads(state_file.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'{state_file}: invalid JSON ({exc})')
        continue

    for key in ['schemaVersion', 'changeId', 'tier', 'state', 'impact', 'tooling', 'validation']:
        if key not in data:
            errors.append(f'{state_file}: missing required field {key}')

    if data.get('tier') not in allowed_tiers:
        errors.append(f"{state_file}: invalid tier {data.get('tier')}")
    if data.get('state') not in allowed_states:
        errors.append(f"{state_file}: invalid state {data.get('state')}")

    impact = data.get('impact') or {}
    for key in ['api', 'data', 'architecture', 'rule']:
        if impact.get(key) not in allowed_impact:
            errors.append(f"{state_file}: impact.{key} invalid ({impact.get(key)})")

    validation = data.get('validation') or {}
    if validation.get('status') not in allowed_validation:
        errors.append(f"{state_file}: validation.status invalid ({validation.get('status')})")

    state = data.get('state')
    if state == 'VALIDATED' and validation.get('status') != 'fresh':
        errors.append(f'{state_file}: state=VALIDATED requires validation.status=fresh')
    if state == 'ARCHIVED' and validation.get('status') == 'missing':
        errors.append(f'{state_file}: state=ARCHIVED cannot have validation.status=missing')

if errors:
    for err in errors:
        print(err, file=sys.stderr)
    sys.exit(1)

print('Artifact state validation passed.')
PY
