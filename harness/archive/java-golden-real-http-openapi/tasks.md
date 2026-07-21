# Tasks

Status: draft-plan

## Preconditions
- clarify-ready: issue #9 scope 已收窄为 real HTTP E2E + service-scoped OpenAPI semantic validation + docs/validation evidence
- design-approved:
- plan-critic verdict:
- current active change: `java-golden-real-http-openapi`

### Task 1: 新增 random-port real HTTP E2E

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerHttpE2ETest.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/ApiErrorResponse.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/ApiExceptionHandler.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`

**Consumes**
- current MockMvc integration test
- random-port HTTP testing support from Spring Boot test stack
- `OrderJpaRepository` / `OrderEntity` for test-only data setup and persistence assertions

**Produces**
- real socket-level HTTP E2E evidence
- persistence final-state assertion
- proof that `/v3/api-docs` endpoint is reachable from a booted backend
- proof that live docs 显式暴露 cancel-order 的 `400/404/409` + `ApiErrorResponse` 语义

- [x] 写失败测试
  - 先新增独立 `OrderCancellationControllerHttpE2ETest`，固定断言真实 HTTP response、持久化最终状态、`/v3/api-docs` endpoint 可访问，以及 cancel-order operation 必须显式暴露 `400/404/409` + `ApiErrorResponse`；此时不要先改 production annotations / YAML
- [x] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerHttpE2ETest test`
  - Expected failure: live docs 当前缺少 cancel-order operation 的显式 `400/404/409` + `ApiErrorResponse` 语义
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerHttpE2ETest test`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/reviews/verification-reviewer-task1.json`

### Task 2: 新增 service-scoped OpenAPI semantic assertion

**Files**
- Create: `/home/wula/IdeaProjects/sdd/reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationOpenApiSemanticTest.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/openapi/order-service.yaml`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderRequest.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderResponse.java`
- Modify if needed: `/home/wula/IdeaProjects/sdd/reference-service/src/main/java/com/example/orders/interfaces/api/dto/ApiErrorResponse.java`

**Consumes**
- owned OpenAPI YAML
- live `/v3/api-docs`
- fixed semantic keys for cancel-order

**Produces**
- service-scoped semantic assertion（owned YAML ↔ live docs）
- stronger OpenAPI evidence without touching shared runtime verifier

- [x] 写失败测试
  - 先新增 `OrderCancellationOpenApiSemanticTest`，固定比较 path / method / operationId / request schema / response schema / `400/404/409` / `ApiErrorResponse` / reason non-blank 等关键语义；此时不先改 production annotations 或 YAML
- [x] 运行 RED 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationOpenApiSemanticTest test`
  - Expected failure: live docs 对 `CancelOrderRequest.reason` 的 non-blank 语义当前不完整，导致 owned YAML ↔ live docs 至少一项关键语义不一致
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationOpenApiSemanticTest test`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/reviews/verification-reviewer-task2.json`

### Task 3: 明确 real backend sample / MapStruct / quality-profile 文档与 validation evidence

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/CONTRIBUTING.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/validation.md`

**Consumes**
- Task 1 / Task 2 的实际结果
- issue #9 audit comments

**Produces**
- 更准确的 real backend sample 说明
- MapStruct generated code / interface responsibility 说明
- durable validation evidence

- [x] 写失败测试
- [x] 运行 RED 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': [\n    'real backend sample',\n    'random-port HTTP E2E',\n  ],\n  '/home/wula/IdeaProjects/sdd/CONTRIBUTING.md': [\n    'generated `*MapperImpl` are build artifacts',\n    'later CI should reuse the same Maven verify command',\n  ],\n  '/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/validation.md': [\n    'Task 1 HTTP E2E validation command:',\n    'Task 2 OpenAPI semantic validation command:',\n  ],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif not missing:\n    raise SystemExit('UNEXPECTED_PASS')\nprint('\\n'.join(missing))\nraise SystemExit(1)\nPY`
  - Expected failure: 至少一条精确文档/validation 断言未满足
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `python - <<'PY'\nfrom pathlib import Path\nchecks = {\n  '/home/wula/IdeaProjects/sdd/README.md': [\n    'real backend sample',\n    'random-port HTTP E2E',\n  ],\n  '/home/wula/IdeaProjects/sdd/CONTRIBUTING.md': [\n    'generated `*MapperImpl` are build artifacts',\n    'later CI should reuse the same Maven verify command',\n  ],\n  '/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/validation.md': [\n    'Task 1 HTTP E2E validation command:',\n    'Task 2 OpenAPI semantic validation command:',\n  ],\n}\nmissing = []\nfor file, tokens in checks.items():\n    text = Path(file).read_text()\n    for token in tokens:\n        if token not in text:\n            missing.append(f'{file}: missing exact assertion: {token}')\nif missing:\n    raise SystemExit('\\n'.join(missing))\nprint('OK exact doc assertions passed')\nPY`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/java-golden-real-http-openapi/reviews/verification-reviewer-task3.json`
