#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../../../.." && pwd)"

required_patterns=(
  '^openapi:'
  '^paths:'
  '^components:'
)

mapfile -t OPENAPI_DIRS < <(
  cd "$ROOT" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
)

if [ "${#OPENAPI_DIRS[@]}" -eq 0 ]; then
  printf 'OpenAPI directory not present yet, skipping validation.\n'
  exit 0
fi

checked=0
for dir in "${OPENAPI_DIRS[@]}"; do
  while IFS= read -r -d '' yaml_file; do
    checked=1
    for pattern in "${required_patterns[@]}"; do
      if ! grep -Eq "$pattern" "$yaml_file"; then
        rel_path="${yaml_file#"$ROOT"/}"
        printf 'OpenAPI validation failed: missing pattern %s in %s\n' "$pattern" "$rel_path" >&2
        exit 1
      fi
    done
  done < <(find "$ROOT/${dir#./}" -maxdepth 1 -type f \( -name '*.yaml' -o -name '*.yml' \) -print0)
done

if [ "$checked" -eq 0 ]; then
  printf 'OpenAPI YAML file not present yet, skipping validation.\n'
  exit 0
fi

printf 'OpenAPI structure validation passed.\n'
