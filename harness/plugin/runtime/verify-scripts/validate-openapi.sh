#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../../../.." && pwd)"
YAML_FILE="$ROOT/reference-service/openapi/order-service.yaml"

if [ ! -f "$YAML_FILE" ]; then
  printf 'OpenAPI file not present yet, skipping validation.\n'
  exit 0
fi

required_patterns=(
  '^openapi:'
  '^paths:'
  '^components:'
)

for pattern in "${required_patterns[@]}"; do
  if ! grep -Eq "$pattern" "$YAML_FILE"; then
    printf 'OpenAPI validation failed: missing pattern %s in %s\n' "$pattern" "$YAML_FILE" >&2
    exit 1
  fi
done

printf 'OpenAPI structure validation passed.\n'
