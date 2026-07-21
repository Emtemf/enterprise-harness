# Tooling Evidence

## codegraph

- Status: used
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `reference-service real HTTP E2E current test setup OpenAPI contract ownership controller yaml parser possibilities random port testing current Spring Boot tests`
- Key Findings:
  - 当前 `OrderCancellationControllerIntegrationTest` 仍是 MockMvc，不是 random-port real HTTP E2E
  - owned OpenAPI YAML 已存在，可作为 stronger semantic assertion 锚点
  - 当前 shared runtime validator 只做 light marker checks，因此本 issue 现改为 service-scoped semantic assertion，而不是修改共享 runtime verifier
- Fallback Reason: none

## Context7

- Status: usable-via-cli
- Library Name: Spring Boot
- Resolved Library ID: `/spring-projects/spring-boot`
- Version: project dependency is Spring Boot `3.5.0`; docs evidence queried against `v3.5.3` reference docs for `@SpringBootTest(webEnvironment = RANDOM_PORT)` / `TestRestTemplate`
- Query: `@SpringBootTest webEnvironment RANDOM_PORT TestRestTemplate`
- Key Findings:
  - `@SpringBootTest(webEnvironment = RANDOM_PORT)` 会启动 embedded server
  - 可用 `TestRestTemplate` 发真实 HTTP 请求
  - 可通过 `@LocalServerPort` 获取随机端口
- Fallback Reason: none

- Status: usable-via-cli
- Library Name: springdoc-openapi
- Resolved Library ID: `/springdoc/springdoc-openapi`
- Version: project dependency is `springdoc-openapi-starter-webmvc-ui 2.8.9`
- Query: `OpenAPI responses schema operationId annotations /v3/api-docs`
- Key Findings:
  - `/v3/api-docs` 是 live OpenAPI JSON 入口
  - 可通过 OpenAPI annotations 明确 operation metadata / response metadata
- Fallback Reason: none

## Vendor / Official Docs

- Source: Spring Boot docs + springdoc docs via Context7 CLI wrapper
- Version / Snapshot:
  - Spring Boot runtime dependency: `3.5.0`
  - Spring Boot docs queried: `v3.5.3`
  - springdoc runtime dependency: `2.8.9`
- Query:
  - RANDOM_PORT / TestRestTemplate / live `/v3/api-docs`
- Key Findings:
  - 当前框架依赖足以支持 random-port backend E2E 与 live docs semantic assertion
  - 不需要为本 issue 额外引入新的测试框架才能完成目标
