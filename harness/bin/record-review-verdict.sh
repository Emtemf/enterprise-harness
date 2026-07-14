#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd)"
CHANGES_DIR="$ROOT/harness/changes"
TEMPLATE="$ROOT/harness/templates/review-verdict.json"

if [ "$#" -lt 3 ]; then
  printf '用法：%s <change-id> <reviewer-id> <verdict>\n' "$0" >&2
  exit 1
fi

CHANGE_ID="$1"
REVIEWER_ID="$2"
VERDICT="$3"
REVIEW_DIR="$CHANGES_DIR/$CHANGE_ID/reviews"
TARGET="$REVIEW_DIR/$REVIEWER_ID.json"

mkdir -p "$REVIEW_DIR"

python - <<'PY' "$TEMPLATE" "$TARGET" "$CHANGE_ID" "$REVIEWER_ID" "$VERDICT"
import json
import sys
from pathlib import Path

template = Path(sys.argv[1])
target = Path(sys.argv[2])
change_id = sys.argv[3]
reviewer_id = sys.argv[4]
verdict = sys.argv[5]
allowed = {'pass', 'block', 'advisory'}
if verdict not in allowed:
    print('verdict 只允许 pass/block/advisory', file=sys.stderr)
    sys.exit(1)

data = json.loads(template.read_text(encoding='utf-8')) if template.exists() else {}
data['changeId'] = change_id
data['reviewerId'] = reviewer_id
data['verdict'] = verdict
if data.get('findings') is None:
    data['findings'] = []
if data.get('evidence') is None:
    data['evidence'] = []
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'已创建或更新 reviewer verdict：{target}')
PY
