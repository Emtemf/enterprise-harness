#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

bash "$ROOT/hooks/validate-spec-structure.sh"
bash "$ROOT/hooks/validate-artifact-state.sh"
bash "$ROOT/hooks/validate-review-verdicts.sh"
bash "$ROOT/hooks/validate-change-evidence.sh"

if [ -f "$ROOT/reference-service/openapi/order-service.yaml" ]; then
  bash "$ROOT/hooks/validate-openapi.sh"
fi

if [ -f "$ROOT/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java" ]; then
  bash "$ROOT/hooks/validate-controller-consistency.sh"
fi

printf 'Post-write gate passed. 如有业务完成声明，后续仍需 fresh validation 证据。\n'
