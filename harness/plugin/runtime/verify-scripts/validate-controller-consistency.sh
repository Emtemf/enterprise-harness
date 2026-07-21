#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "$0")/../../../.." && pwd)"
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
