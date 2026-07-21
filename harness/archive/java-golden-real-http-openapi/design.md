# Design

## Requirement Alignment

本 change 对应 issue #9，目标是在保持 `reference-service` 样板规模不膨胀的前提下，让它更接近 real backend sample，而不是只停留在：

- MockMvc integration
- 轻量 OpenAPI marker 检查
- 文档式质量声明

本轮设计至少要回答：

1. 如何补真实 HTTP backend E2E
2. 如何把 OpenAPI semantic validation 提升为 **service-scoped** owned YAML ↔ live docs 语义断言
3. 如何在 docs / validation 中准确说明 MapStruct 与 quality profile 边界

## Current-State Evidence

当前仓库状态：

- `OrderCancellationControllerIntegrationTest` 仍是 `@AutoConfigureMockMvc` 路径，不是 socket-based random-port E2E
- `reference-service/openapi/order-service.yaml` 已是 owned contract，但当前 repo 中还没有把它与 live `/v3/api-docs` 做关键字段对齐的服务级断言
- `README.md` / `CONTRIBUTING.md` 已说明本地 Java quality gate 命令，但还未说明 real backend evidence / MapStruct generated code / later CI 的完整 quality-profile 语义

## Documentation Evidence

本轮框架行为结论已补到 tooling evidence：

- Spring Boot：当前项目依赖是 `3.5.0`；Context7 已确认 `@SpringBootTest(webEnvironment = RANDOM_PORT)` 会启动 embedded server，且可配合 `TestRestTemplate` / `@LocalServerPort` 做 real HTTP 测试
- springdoc：当前项目依赖是 `springdoc-openapi-starter-webmvc-ui 2.8.9`；Context7 已确认 `/v3/api-docs` 是 live OpenAPI JSON 入口，可通过 OpenAPI annotations 强化 response / schema / operation metadata

## Selected Approach

### 1. 保留 MockMvc integration，新增独立 random-port E2E
当前不替换已有 MockMvc integration。

第一版 real backend evidence 采用：
- 新增独立 `OrderCancellationControllerHttpE2ETest`
- `@SpringBootTest(webEnvironment = RANDOM_PORT)`
- `TestRestTemplate` 发真实 HTTP 请求
- 断言 response + 持久化最终状态
- 断言 `/v3/api-docs` endpoint 可访问

这样可以同时保留：
- MockMvc 作为细粒度 controller integration
- random-port HTTP 作为 real backend E2E

### 2. API 兼容性边界
本轮 `impact.api = yes`，但语义是：

- **允许** 为了让 live `/v3/api-docs` 更准确而补充 OpenAPI/Swagger annotations、schema metadata、error response 文档
- **不允许** 新增 endpoint、修改 path / method、改变 request/response/error 的外部可观察契约语义
- 若发现 owned YAML 与当前 live docs 真的存在 drift，则优先让 live docs 对齐到当前 owned contract，而不是随意改变 contract 本身

也就是说：
> 本轮允许的是 **文档语义对齐修复**，不是新的 API 能力或兼容性破坏变更。

### 3. 受影响层与边界
- `interfaces`：允许变更控制器 OpenAPI annotations、Req/Rsp schema metadata、error response 文档语义
- `application`：本轮不应引入新的业务分支或 DTO 语义扩张
- `domain`：本轮不改业务规则
- `infrastructure`：只允许在 E2E 测试中通过 `OrderJpaRepository` / `OrderEntity` 做数据准备与最终状态断言，不改变生产层依赖方向

### 4. repository port 与 mapper 责任
- `domain.repository.OrderRepository`：保持 domain inward port，不变
- `interfaces.api.mapper.OrderCancellationApiMapper`：保持 Req/Rsp ↔ application DTO 的接口层职责
- `application.mapper.OrderCancellationApplicationMapper`：保持 application DTO ↔ domain 的职责
- `infrastructure.persistence.mapper.OrderPersistenceMapper`：保持 domain ↔ Entity 的职责
- `*MapperImpl`：继续视为 generated artifacts，本轮只在 docs/quality-profile 中解释，不把其当作 hand-authored 设计面

### 5. OpenAPI semantic validation 改为 service-scoped，而不是修改共享 runtime verifier
本轮 stronger OpenAPI semantic validation 不再修改共享 `harness/plugin/runtime/lib/checks.mjs`。

改为：
- 在 `reference-service` 测试侧新增 service-scoped semantic assertion
- 同时读取：
  - owned YAML：`reference-service/openapi/order-service.yaml`
  - live docs：`GET /v3/api-docs`
- 校验 cancel-order 的关键字段一致性

这能保持 issue #9 为 L2 sample change，而不是升格为 repo runtime / platform rule 变更。

### 6. 本轮固定的语义断言范围
service-scoped semantic assertion 至少固定检查：

- path：`/api/orders/{orderId}/cancel`
- method：`post`
- operationId：`cancelOrder`
- request schema：`CancelOrderRequest`
- success response schema：`CancelOrderResponse`
- error responses：`400` / `404` / `409` 都存在，且指向 `ApiErrorResponse`
- request.reason 的 required / non-blank 语义
- response DTO 关键字段：`orderId` / `status` / `reason`
- `ApiErrorResponse.error` 字段语义存在

### 7. Task boundary split
为避免 Task 1 与 Task 2 重叠，当前明确拆分：

- **Task 1**：证明 real backend sample —— random-port HTTP 请求、response、持久化最终状态，以及 live docs 中 **error response 可见性**。其固定 RED 断言为：cancel-order operation 必须显式暴露 `400/404/409` 与 `ApiErrorResponse` 语义；当前无显式 OpenAPI response annotations，预期失败。
- **Task 2**：证明 deeper semantic parity —— owned YAML ↔ live docs 在 request/response schema 细节上的逐项对齐。其固定 RED 断言为：`CancelOrderRequest.reason` 的 non-blank 语义（如 description / minLength / pattern）当前不会完整出现在 live docs，预期失败。

因此：
- Task 1 负责 real backend + error response visibility
- Task 2 负责 deeper schema parity

### 8. MapStruct 边界说明
本轮文档中明确：
- mapper interface 是 hand-authored source
- `*MapperImpl` 是 generated artifacts
- JaCoCo excludes 继续允许排除 `*MapperImpl`
- quality profile 的重点是 boundary clarity 与 backend evidence，而不是 generated code 覆盖率营销

## Rejected Approaches

### Rejected A：直接把 MockMvc 测试改成 random-port，删除原 integration test
原因：
- 会丢掉当前已有的快速 integration coverage
- random-port 与 MockMvc 证明的是不同层次，不应互相替代

### Rejected B：把 stronger OpenAPI validation 做成 repo-wide runtime verifier 增强
原因：
- requirement-reviewer 已指出这会把 scope 拉到共享 runtime/rule 面，弱化当前 L2 定位
- 当前 issue 是 `reference-service` golden sample，不是平台产品化 issue

## Affected Files

### 必改
- `README.md`
- `CONTRIBUTING.md`

### 新增
- `reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerHttpE2ETest.java`
- `reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationOpenApiSemanticTest.java`

### 按需修改
- `reference-service/openapi/order-service.yaml`
- `reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
- `reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderRequest.java`
- `reference-service/src/main/java/com/example/orders/interfaces/api/dto/CancelOrderResponse.java`
- `reference-service/src/main/java/com/example/orders/interfaces/api/dto/ApiErrorResponse.java`
- `reference-service/src/main/java/com/example/orders/interfaces/api/ApiExceptionHandler.java`
- `reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java`（仅在确有必要共享数据准备时）

## Testing Strategy

### Task 1：real HTTP backend E2E
- RED：先写 random-port E2E，并固定 fail-fast 断言为：live docs 中 cancel-order operation 必须显式暴露 `400/404/409` + `ApiErrorResponse`；当前预期失败
- GREEN：补齐独立 E2E 测试类，并以最小 annotations 让 real HTTP + persistence final-state + live docs error response visibility 通过
- VERIFY：targeted E2E + full `mvn verify`

### Task 2：service-scoped OpenAPI semantic assertion
- RED：先写 `OrderCancellationOpenApiSemanticTest`，并固定 fail-fast 断言为：live docs 对 `CancelOrderRequest.reason` 的 non-blank 语义（如 description / minLength / pattern）当前不完整，导致 owned YAML ↔ live docs 语义不一致
- GREEN：补最小 schema metadata / YAML 对齐修复后通过，再继续检查 operationId / request schema / response schema / required fields 等关键语义
- VERIFY：`mvn verify`

### Task 3：quality profile docs / validation evidence
- RED：精确文档断言脚本先失败
- GREEN：README / CONTRIBUTING / validation.md 对齐后通过
- VERIFY：文档断言 + `mvn verify`

## Risks

- random-port E2E 如果过多依赖序列化细节，会变脆
- semantic assertion 如果检查 whole doc dump，会过宽且难维护
- 文档如果写成宣传口径，仍会让“real backend sample”被误读成“生产级服务”

## Rollout / Rollback

- rollout：先在 `reference-service` 内增量补 real backend evidence 与 service-scoped contract assertion
- rollback：若 live-doc semantic assertion 过宽，可先收窄到 cancel-order 关键字段，而不撤掉 random-port E2E 本身
