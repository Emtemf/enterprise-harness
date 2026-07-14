# Tooling Evidence

## codegraph

- Status: ready
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `reference-service cancel order flow controller application domain infrastructure repository DTO mapper entity openapi tests current architecture issues for boundary realignment`
- Key Findings:
  - `CancelOrderUseCase` 当前直接返回 `interfaces.api.dto.CancelOrderResponse`
  - `OrderCancellationService` 当前直接 import `interfaces.api.dto.CancelOrderResponse` 与 `infrastructure.persistence.OrderRepository`
  - `OrderRepository` 当前定义在 infrastructure 包
  - `OrderCancellationPolicy` 当前带 `@Component`
  - controller 与 tests 直接依赖当前 transport DTO 路径
- Fallback Reason: 无

## Context7

- Status: mixed
- Library Name: ArchUnit
- Resolved Library ID: `/tng/archunit`
- Version: 未显式锁定；当前仅用于设计参考
- Query: `junit 5 layered architecture example`
- Key Findings:
  - 可用 JUnit 5 + ArchUnit 定义 layered architecture 规则
  - 可通过 `@ArchTest` / `layeredArchitecture()` 表达包边界约束
- Fallback Reason: MapStruct 的 library resolve 失败一次，因此直接尝试 docs 查询

## Vendor / Official Docs

- Source: Context7 docs output for `/mapstruct/mapstruct`
- Version / Snapshot: 当前查询快照
- Query: `mapper interface spring component model`
- Key Findings:
  - `@Mapper(componentModel = "spring")` 可生成 Spring bean
  - 可用构造注入策略支撑 mapper wiring
