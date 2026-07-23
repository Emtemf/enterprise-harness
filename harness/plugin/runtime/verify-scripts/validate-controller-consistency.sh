#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../../../.." && pwd)"
# 注意：该脚本文件名刻意保持不变（避免牵连 full-verify.sh 与 CLAUDE.md 的文件名引用），
# 但其语义范围仅限 reference-service 自身回归检查，不是通用的任意项目
# OpenAPI-Controller 交叉一致性校验器。
YAML_FILE="$ROOT/reference-service/openapi/order-service.yaml"
CONTROLLER_FILE="$ROOT/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java"

if [ ! -f "$YAML_FILE" ] || [ ! -f "$CONTROLLER_FILE" ]; then
  printf 'Controller or OpenAPI file not present yet, skipping consistency validation.\n'
  exit 0
fi

if ! grep -Fq '/api/orders/{orderId}/cancel:' "$YAML_FILE"; then
  printf 'Controller consistency validation failed: expected path missing from YAML.\n' >&2
  exit 1
fi

if ! grep -Eq '^\s+post:' "$YAML_FILE"; then
  printf 'Controller consistency validation failed: expected POST method missing from YAML.\n' >&2
  exit 1
fi

if ! grep -Fq '@RequestMapping("/api/orders")' "$CONTROLLER_FILE"; then
  printf 'Controller consistency validation failed: expected base request mapping missing from controller.\n' >&2
  exit 1
fi

if ! grep -Fq '@PostMapping("/{orderId}/cancel")' "$CONTROLLER_FILE"; then
  printf 'Controller consistency validation failed: expected post mapping missing from controller.\n' >&2
  exit 1
fi

printf 'Controller/OpenAPI consistency validation passed.\n'
