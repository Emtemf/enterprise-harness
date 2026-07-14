# Validation

## Source Digest

- `reference-service/src/main/java/com/example/orders/**`
- `reference-service/src/test/java/com/example/orders/**`
- `reference-service/openapi/order-service.yaml`
- `harness/changes/reference-service-boundary-realignment/**`

## Artifact Digest

- active change: `harness/changes/reference-service-boundary-realignment/`
- current state: `VALIDATED`
- validation date: 2026-07-13

## Commands Executed

### 1. codegraph discovery

```bash
codegraph status
```

Observed result summary:

```text
Index is up to date
19 files / 145 nodes / 215 edges
```

### 2. Context7 wrapper checks

```bash
bash harness/bin/context7-library.sh MapStruct "bean mapping"
bash harness/bin/context7-docs.sh /tng/archunit "junit 5 layered architecture example"
bash harness/bin/context7-docs.sh /mapstruct/mapstruct "mapper interface spring component model"
```

Observed result summary:

```text
- MapStruct library resolve 失败一次（fetch failed）
- ArchUnit docs query 成功返回 layered architecture / JUnit 5 示例
- MapStruct direct docs query 成功返回 Spring component model 参考
```

### 3. Task 1 RED

```bash
mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationServiceTest test
```

Observed result summary:

```text
testCompile 失败：
- 缺少 application.dto.CancelOrderResultDto
- 缺少 domain.repository.OrderRepository
- 旧测试中的返回类型仍引用旧 transport DTO
```

### 4. 当前 GREEN：reference-service 全量测试

```bash
mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml test
```

Observed result summary:

```text
BUILD SUCCESS
Tests run: 9, Failures: 0, Errors: 0, Skipped: 0
```

### 5. 当前 GREEN：error contract 定向验证与本地契约检查

```bash
mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml -Dtest=OrderCancellationControllerIntegrationTest test
bash /home/wula/IdeaProjects/sdd/hooks/validate-openapi.sh
bash /home/wula/IdeaProjects/sdd/hooks/validate-controller-consistency.sh
bash /home/wula/IdeaProjects/sdd/hooks/full-verify.sh
```

Observed result summary:

```text
- OrderCancellationControllerIntegrationTest 5/5 通过
- OpenAPI structure validation passed.
- Controller/OpenAPI consistency validation passed.
- Full verify（骨架阶段）通过。
```

## Unit Tests

已记录并观察到：

- Task 1 RED：缺少 application DTO / domain repository port 的编译失败
- Task 2 RED：domain policy 仍带 `@Component` 的断言失败
- Task 3 RED：`JpaOrderRepository` 尚未直接实现 domain repository port 的断言失败
- 当前 GREEN：`mvn test` 已通过，包含 application、controller integration、repository integration、domain policy architecture 相关测试

## Unit Coverage

尚未进入实现完成阶段，不适用。

## Architecture Tests

尚未引入 ArchUnit 到本项目构建，仅完成设计参考探索。

## Integration Tests

已重新运行并通过：

- `OrderCancellationControllerIntegrationTest`
- `JpaOrderRepositoryIntegrationTest`

其中 controller integration test 已覆盖：

- 200 success path
- 404 order not found
- 409 invalid cancel status
- 400 request validation failure

## Backend API E2E

尚未进入实现，未运行 API E2E。

## OpenAPI Contract

当前已补齐最小 error contract：

- `400` validation failed
- `404` order not found
- `409` order cannot be cancelled

并已在 OpenAPI YAML 中加入 `ApiErrorResponse` schema。

## Google Java Style

尚未进入实现完成阶段，不适用。

## Review Verdicts

- design reviewer：advisory，建议补 state impact、domain policy 装配归属、repository adapter 本地 DB 测试与 API contract waiver 表达
- plan critic：block，要求重新拆分 tasks，避免 Task 1 无法独立 GREEN、domain policy 去注解无装配落点、MapStruct 任务过大
- 处理结果：已据此修正 design 与 tasks，再进入实现
- API consistency reviewer（旧结论）：block，指出 success path 一致，但 error contract 缺失
- 当前处理结果：已新增 `ApiExceptionHandler`、`ApiErrorResponse` 与 OpenAPI 4xx/409 response，并把 400 描述放宽为“请求体验证或解析失败”
- API consistency reviewer（最新结论）：advisory，确认 success path 与 404/409 error contract 已形成最小闭环，仅剩“自动化契约语义检查仍偏轻量”的后续增强建议
- verification reviewer（旧结论）：advisory，指出测试产物新鲜，但 validation/state 未同步
- 当前处理结果：已补 state / validation 记录与独立日志产物
- verification reviewer（最新结论）：pass，确认当前 Maven/surefire 证据足以支撑“第一批边界修正 + 最小 error contract 已通过当前阶段验证”的声明

## Skipped Checks

- JaCoCo：未接入
- ArchUnit：未接入
- 真实 HTTP API E2E：未接入

## Failures and Retries

- Context7 `library` 对 MapStruct 的首次解析失败，后续改用 direct docs query 成功获取 Spring component model 参考。
- `OrderCancellationServiceTest` 先被主动改造成 Task 1 的 RED，随后通过引入 application DTO、domain repository port 和 controller 最小显式映射恢复为 GREEN。
- 首次引入 `OrderPersistenceMapper` 抽象映射方法时，`mvn test` 在 compile 阶段报出 `Unmapped target property: \"cancel\"`；后续改为显式 `@BeanMapping(ignoreByDefault = true)` + 字段级 `@Mapping` 后恢复为 GREEN。

## Final Verdict

当前 change 已具备：

- codegraph-first 探索证据
- Context7/文档探索证据
- L2 路由结论
- 经 review 修正后的 design / tasks 资产
- Task 1 / Task 2 / Task 3 的 RED → GREEN 证据
- 当前纵切的最小 MapStruct 接入与编译通过证据
- cancel-order 最小 error contract 与 4xx/409 集成测试通过证据

当前 `reference-service` 已完成第一批边界修正并通过当前阶段验证；后续仍需继续进入 ArchUnit / JaCoCo / 真实 HTTP API E2E / 更强契约硬门禁阶段。
