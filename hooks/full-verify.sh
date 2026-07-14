#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"

printf '[full-verify] 1/7 结构校验\n'
bash "$ROOT/hooks/validate-spec-structure.sh"

printf '[full-verify] 2/7 OpenAPI 轻量校验\n'
if [ -f "$ROOT/reference-service/openapi/order-service.yaml" ]; then
  bash "$ROOT/hooks/validate-openapi.sh"
else
  printf 'OpenAPI 文件缺失，当前阶段跳过。\n'
fi

printf '[full-verify] 3/7 Controller/OpenAPI 一致性轻量校验\n'
if [ -f "$ROOT/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java" ]; then
  bash "$ROOT/hooks/validate-controller-consistency.sh"
else
  printf 'Controller 文件缺失，当前阶段跳过。\n'
fi

printf '[full-verify] 4/7 状态文件校验\n'
bash "$ROOT/hooks/validate-artifact-state.sh"

printf '[full-verify] 5/7 review verdict 校验\n'
bash "$ROOT/hooks/validate-review-verdicts.sh"

printf '[full-verify] 6/7 change evidence 校验\n'
bash "$ROOT/hooks/validate-change-evidence.sh"

printf '[full-verify] 7/7 模板占位检查（骨架阶段）\n'
if grep -R "TODO\|TBD" "$ROOT/harness/templates" >/dev/null 2>&1; then
  printf '发现模板中残留 TODO/TBD，请清理。\n' >&2
  exit 1
fi

printf 'Full verify（骨架阶段）通过。\n'
