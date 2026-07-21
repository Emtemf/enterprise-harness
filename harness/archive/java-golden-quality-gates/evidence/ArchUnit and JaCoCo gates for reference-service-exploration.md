# Exploration

## Topic
ArchUnit and JaCoCo gates for reference-service

## Date
2026-07-16

## Request Shape
modify

## Candidate Tier
L2

## Owning Module / Domain / Service
- service: `reference-service`
- domain: Java reference quality profile
- supporting docs: `README.md`, `CONTRIBUTING.md`

## Codegraph Attempt
- Status: used
- Queries:
  - `reference-service architecture tests existing test classes controller integration repository integration domain policy vertical slices and package layering`
- Key Findings:
  - 当前只有 `OrderCancellationPolicyArchitectureTest` 这种 ad-hoc architecture test，不是 ArchUnit
  - 当前测试集合可作为 JaCoCo 第一版 coverage surface：application / domain / persistence / MockMvc integration
  - 当前 controller integration 仍是 MockMvc，不属于真实 HTTP E2E，因此不应在 #12 中误表述成已完成 E2E
- Fallback Reason: none

## Context7 / Documentation Attempt
- Library Name: ArchUnit
- Resolved Library ID: `/tng/archunit`
- Version: docs-current
- Query: `junit 5 layeredArchitecture package rules example`
- Key Findings:
  - JUnit 5 可使用 `@AnalyzeClasses` + `@ArchTest`
  - `layeredArchitecture()` 可表达 package 访问规则
- Fallback Reason: none

- Library Name: JaCoCo
- Resolved Library ID: `/websites/jacoco_jacoco_trunk_doc`
- Version: docs-current
- Query: `maven check rule minimum line coverage verify phase example`
- Key Findings:
  - `jacoco:check` 默认绑定 `verify`
  - 可通过 `rules` 设置 line / instruction coverage threshold
  - 85% 门槛可表达为 `0.85` 或 `85%`
- Fallback Reason: `context7-library` 解析到通用 JaCoCo 文档站点后，再用 docs 查询取得 Maven check 细节

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns
- 85% 第一版按 bundle 还是按 sample 核心包执行更稳妥
- 是否需要少量补测才能让 JaCoCo 达到目标阈值

## Decisions Required
- 是否在 #12 只做 ArchUnit + JaCoCo + 文档，而把真实 HTTP E2E 保持在 #9
- JaCoCo 第一版 scope 选 bundle 还是核心样板包

## Confidence
medium-high
