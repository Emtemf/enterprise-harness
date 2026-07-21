# Exploration

## Topic
real HTTP E2E and stronger OpenAPI validation for reference-service

## Date
2026-07-16

## Request Shape
modify

## Candidate Tier
L2

## Owning Module / Domain / Service
- service: `reference-service`
- domain: Java golden sample / real backend evidence
- supporting validator: `harness/plugin/runtime/lib/checks.mjs`

## Codegraph Attempt
- Status: used
- Queries:
  - `reference-service real HTTP E2E current test setup OpenAPI contract ownership controller yaml parser possibilities random port testing current Spring Boot tests`
- Key Findings:
  - 当前 `OrderCancellationControllerIntegrationTest` 仍是 MockMvc，不是 real HTTP E2E
  - owned OpenAPI YAML 已存在，可作为 stronger semantic validation 的锚点
  - 当前 runtime validator 只做轻量 marker 检查，仍不足以证明语义一致
- Fallback Reason: none

## Context7 / Documentation Attempt
- Library Name: Spring Boot test stack
- Resolved Library ID: repo code facts only
- Version: current project dependencies
- Query: random-port real HTTP testing possibility in current stack
- Key Findings:
  - 当前 Spring Boot test 依赖已足以支持 `@SpringBootTest(webEnvironment = RANDOM_PORT)` 路径
- Fallback Reason: current repo code and dependency facts already sufficient

## Impact Summary
- API: yes
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns
- live `/v3/api-docs` 目前缺哪些语义注解，需通过 RED 测试再固定
- semantic validator 是否需要轻量 YAML parse helper 还是 sample-aware string/structure checks 即可

## Decisions Required
- 保留 MockMvc integration，还是替换成 random-port E2E（当前决定：保留并新增独立 E2E）
- semantic validation 是 sample-aware 还是泛化平台能力（当前决定：保持 sample-aware）

## Confidence
medium-high
