# Design

## Requirement Alignment

本轮只做 `reference-service` 第一批边界对齐，不做功能扩展。目标是把当前 cancel-order 纵切从“目录分层演示”推进到“编译依赖方向更正确的黄金样板起点”。

必须满足的三件事：

1. application 不再直接返回 interface DTO
2. repository port 不再定义在 infrastructure 包
3. domain policy 去除 Spring 注解

## Current-State Evidence

基于本次 codegraph 探索，当前关键问题如下：

- `reference-service/src/main/java/com/example/orders/application/CancelOrderUseCase.java` 直接返回 `CancelOrderResponse`
- `reference-service/src/main/java/com/example/orders/application/OrderCancellationService.java` import 了 `interfaces.api.dto.CancelOrderResponse` 与 `infrastructure.persistence.OrderRepository`
- `reference-service/src/main/java/com/example/orders/infrastructure/persistence/OrderRepository.java` 当前作为 repository port 定义在 infrastructure 包
- `reference-service/src/main/java/com/example/orders/domain/OrderCancellationPolicy.java` 使用了 Spring `@Component`
- `reference-service/src/test/java/com/example/orders/application/OrderCancellationServiceTest.java` 当前直接断言 interface response DTO
- `reference-service/src/test/java/com/example/orders/interfaces/api/OrderCancellationControllerIntegrationTest.java` 当前通过 MockMvc 断言 HTTP response

## Options Considered

### Option A：一次性把全部黄金样板能力做完
包含 repository port 迁移、application DTO、MapStruct、ArchUnit、JaCoCo、API E2E、OpenAPI error contract 一次性到位。

### Option B：先做第一批边界修正，再分阶段引入质量门禁
先把编译依赖方向与对象边界修正到位，让当前 cancel-order 流转不再违反最核心的 architecture 目标；MapStruct 先在这条纵切引入最小 mapper，不同步扩展全部测试与门禁。

## Selected Option and Rationale

选择 **Option B**。

理由：

- 当前仓库还在从治理骨架迈向可用流程，若本轮同时引入过多门禁，会把问题混在一起
- 先修 application / domain / infrastructure 边界，能立刻让后续 ArchUnit 和 MapStruct 有正确落点
- HTTP contract 暂时不变，能降低本轮行为回归风险

## Rejected Options

拒绝“一次性全做完”作为首轮实现，因为它会把结构修正、工具接入、测试升级和契约扩展耦合在一个 change 里，不利于验证问题归因。

## Affected Layers

- interface：controller 继续作为 transport 层，但开始承担 application result → response 的映射责任
- application：引入 application result DTO，并只依赖 inward port
- domain：保留 `OrderRecord` 与 `OrderCancellationPolicy`，去除 framework 注解；引入 repository port
- infrastructure：`JpaOrderRepository` 改为实现 domain port；持久化对象继续保留 `OrderEntity`

## Cross-layer Type and Mapper Matrix

| Source | Target | 责任层 | 方式 |
|---|---|---|---|
| application result DTO | interface response DTO | interface | 本轮可先用最小 mapper；优先 MapStruct |
| domain record | application result DTO | application | 本轮引入最小 mapper |
| domain record | OrderEntity | infrastructure | 本轮优先引入最小 mapper |

## Repository Port Design

新增 domain-facing repository port，例如：

- `com.example.orders.domain.repository.OrderRepository`

application service 依赖该 port；`JpaOrderRepository` 实现该 port。

## API Contract

本轮不改 HTTP path/method，也不改 success path 的 request/response 字段语义：

- `POST /api/orders/{orderId}/cancel`
- request 仍为 `reason`
- success response 仍返回 `orderId` / `status` / `reason`

同时补齐当前最小 error contract：

- `400`：请求体校验失败
- `404`：订单不存在
- `409`：订单状态不允许取消

建议新增统一错误响应 DTO 与 `@ControllerAdvice`，把当前 `IllegalArgumentException` / `IllegalStateException` / `MethodArgumentNotValidException` 映射为稳定 HTTP 语义。

## Data Design

本轮不改表结构：

- 继续使用现有 `orders` 表
- 不引入 migration
- 不修改 `OrderEntity` 字段集合

## Error Handling

本轮新增最小 `@ControllerAdvice`，把当前已知异常稳定映射为 HTTP error contract：

- `IllegalArgumentException`（order not found）→ `404`
- `IllegalStateException`（invalid cancel status）→ `409`
- `MethodArgumentNotValidException` → `400`

错误响应模型保持小而稳定，本轮不引入复杂 envelope。

## Transaction Boundaries

当前取消流程仍在单服务、单持久化路径内。本轮不引入新的事务边界变化。

## Testing Strategy

本轮遵循 TDD。

至少覆盖：

1. application service 改为返回 application result DTO 后，原有单测先 RED 再改造
2. controller 通过最小映射保持原有 HTTP response，保持 integration test 绿
3. repository port 迁移后，repository adapter 需要有本地 DB 路径回归保护
4. MapStruct 引入后，至少验证 application mapper / API mapper / persistence mapper 的编译生成与 wiring

## Rollout and Rollback

- rollout：本地 reference-service 单仓增量重构
- rollback：若边界重构引发不稳定，可回退到上一版 application/use case 签名与 repository import 布局

## Risks

- application / interface DTO 拆分后，controller 与测试需同步调整
- repository port 迁移若包路径选得不稳，后续 ArchUnit 规则还要再次变动
- 若本轮同时引入过量 mapper，可能让问题排查复杂化

## Open Questions

1. repository port 最终放 `domain.repository` 还是独立 inward port 包？本轮先使用 `domain.repository`。
2. interface ↔ application 的 mapper 是否全部上 MapStruct？本轮至少在 cancel-order 纵切引入最小 MapStruct 示例。

## Composition Root / Bean 装配

`OrderCancellationPolicy` 去掉 `@Component` 后，bean 装配责任应回到 composition root。当前最小方案是在 `ReferenceServiceApplication` 所在根包下新增显式 `@Configuration`，把 `OrderCancellationPolicy` 作为 bean 提供给 application service。这样 domain 保持框架无关，而 Spring wiring 仍由外层负责。

## Design Self-Review

- requirement coverage：已覆盖三项最小边界修正目标
- API/data 双轨：API 语义不变，data 结构不变，缺口已注明
- testability：每个结构改动都对应单测或集成测试调整
- scope：控制在一条纵切，不扩展到完整平台门禁

## Approval

当前作为 active change 的最小设计入口已具备，可进入第一批 tasks。
