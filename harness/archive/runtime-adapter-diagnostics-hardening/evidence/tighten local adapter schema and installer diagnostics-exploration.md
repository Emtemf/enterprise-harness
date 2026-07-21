# Exploration

## Topic
tighten local adapter schema and installer diagnostics

## Date
2026-07-16

## Request Shape
modify

## Candidate Tier
L2

## Owning Module / Domain / Service
- scope: portable runtime
- module: `harness/plugin/runtime/`
- domain: machine-local adapter contract / diagnostics

## Codegraph Attempt
- Status: used
- Queries:
  - `local adapter schema diagnostics install setup doctor sync runtime local-adapter.example.json lib/local-adapter.mjs setup-local-adapter.mjs current gaps required optional fields`
- Key Findings:
  - current validator only checks a minimal fixed set of fields
  - `setup-local-adapter.mjs` only copies or shallow-merges template
  - `doctor.mjs` / `sync.mjs` expose adapter problems but still flatten them into strings
  - issue #13 can stay L2 and sample/runtime-scoped
- Fallback Reason: none

## Context7 / Documentation Attempt
- Library Name: none needed
- Resolved Library ID: n/a
- Version: n/a
- Query: n/a
- Key Findings:
  - 当前问题主要是仓库内 runtime contract 语义，不依赖外部库版本行为
- Fallback Reason: project code facts already sufficient

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns
- `codegraphCommand` / `context7.apiKeyEnvVar` 的 hard/soft required 边界最终如何冻结
- setup / doctor / sync 的职责分层应怎样最小化重复

## Decisions Required
- schemaVersion 是否保持 1
- 哪些字段 hard fail、哪些字段 warning
- docs 中如何解释 machine-local adapter migration expectations

## Confidence
medium-high
