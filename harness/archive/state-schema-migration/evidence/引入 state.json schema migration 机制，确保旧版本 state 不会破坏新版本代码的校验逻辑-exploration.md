# Exploration

## Topic

harness 更新后旧 `state.json` 与新代码的兼容性问题。核心风险：`validateArtifactStates` 里的
`workflow.*` 字段校验、`hasCurrentTaskRedVerification` 对 `gates.redTask`/`redEvidenceRef`
的依赖、以及缺少版本兼容性回归测试。

## Date

2026-07-23

## Request Shape

modify（引入向后兼容的 schema migration 机制）

## Candidate Tier

L2（涉及 `checks.mjs` 核心校验逻辑 + `state.json` schema + 新测试，跨多个文件）

## Owning Module / Domain / Service

- `harness/plugin/runtime/lib/checks.mjs`（`validateArtifactStates` 校验逻辑）
- `harness/plugin/runtime/lib/gates.mjs`（`hasCurrentTaskRedVerification`）
- `harness/templates/state.json`（模板定义）
- 新增 `harness/plugin/runtime/lib/state-migration.mjs`（迁移函数）

## Codegraph Attempt

- Status: available
- Queries: `validateArtifactStates hasCurrentTaskRedVerification schemaVersion state.json migration`
- Key Findings:
  - `validateArtifactStates`（`checks.mjs:203` 起始）：`if (data.workflow)` 为 falsy 时跳过全部 `workflow.*` 校验——**旧 state.json 完全不含 `workflow` 字段时是安全的**
  - 但 `hasCurrentTaskRedVerification`（`gates.mjs:69`）依赖 `gates.redTask`/`gates.redEvidenceRef`；旧 state.json 可能有 `gates.redVerified=true` 但无这两个字段，导致 `currentTask` 为空或字段不存在时返回 `false`，可能误触 BLOCK
  - `state.json` 模板（`harness/templates/state.json`）已有 `schemaVersion: 1`，但**没有任何代码基于 `schemaVersion` 做迁移逻辑**
  - `migrate.mjs` 只处理 `local-adapter.json` 的字段补齐，与 `state.json` 无关
  - 仓库内没有"旧格式 state.json → 新代码"的回归测试
- Fallback Reason: 无需 fallback，直读足够

## Context7 / Documentation Attempt

- Library Name: 不适用（纯仓库内部 schema migration 问题）
- Fallback Reason: 不涉及外部库/SDK

## Impact Summary

- API: no
- Data: yes（直接改 `state.json` 的校验/加载行为）
- Architecture: no
- Rule: no

## Unknowns

- 是否需要引入新的 `schemaVersion` 值（如从 1 升到 2），还是在 version 1 下做向前兼容
- 迁移逻辑应在哪个层面执行：`loadActiveChange`（每次读取时）、`validateArtifactStates`（校验时）、还是单独的 migration 入口
- 旧 state.json 里是否有 `workflow` 字段存在但值不完整的情况（部分迁移），还是完全缺失

## Decisions Required

- 迁移策略：在 `loadActiveChange` 读取时自动补字段 vs 新增独立 migration 命令 vs 校验时容忍缺失
- `schemaVersion` 是否从 1 升到 2（新版本 state 新增字段需要迁移时自动补齐）

## Confidence

高。codegraph 直读确认了问题的精确位置，且现有 state.json 模板已有 `schemaVersion` 字段可作为迁移依据。
