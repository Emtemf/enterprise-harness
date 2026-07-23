# Change

## 原始需求

用户问"像我们这样更新，怎么保证旧的东西不会影响我们新的设计"。经探索确认：`state.json` 没有任何 schema migration 机制，`schemaVersion` 字段存在但未被任何代码消费，旧版本 state.json 在新代码下可能触发意外的校验失败。

## 业务结果

引入 `state-migration.mjs` 模块，在 `loadActiveChange` 读取 `state.json` 时自动检测版本并补齐缺失字段。具体包括：
- 旧 `state.json` 缺少 `workflow.*` 字段时，自动补齐默认值（`stage: 'verify'`/`clarifyReady: true`/等），避免 `validateArtifactStates` 报非法状态
- 旧 `state.json` 有 `gates.redVerified=true` 但缺少 `redTask`/`redEvidenceRef` 时，自动补齐，避免 `hasCurrentTaskRedVerification` 误触 BLOCK
- 新增回归测试：用旧格式 state.json 跑 verify，确认不报错

## 非目标

- 不改 `workflow.mjs`/`lifecycle.mjs` 的业务逻辑
- 不处理 `local-adapter.json` 的 migration（已有 `migrate.mjs` 处理）
- 不改变 `state.json` 的现有字段语义

## 归属服务 / 模块 / 业务域

- scope: harness runtime governance / state management
- owning module: `harness/plugin/runtime/lib/checks.mjs`、`harness/plugin/runtime/lib/gates.mjs`、新增 `harness/plugin/runtime/lib/state-migration.mjs`
- business domain: 向后兼容 / schema migration

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: data_change（改变 state.json 的加载/校验行为）
- reason: 涉及核心校验逻辑 `checks.mjs` 与 `gates.mjs`，且需要新增 migration 模块与回归测试

## 最小探索证据

见 `evidence/引入 state.json schema migration 机制，确保旧版本 state 不会破坏新版本代码的校验逻辑-exploration.md`

## 最终路由

- final tier: L2
- owning scope: `checks.mjs` + `gates.mjs` + 新增 `state-migration.mjs` + 回归测试
- next focus: design 阶段确定迁移策略与具体实现方案

## 影响矩阵

- API: no
- data: yes（直接改变 state.json 的加载/校验行为）
- architecture: no
- rule: no

## 需要确认的决策

- 迁移应在何时执行：`loadActiveChange`（每次读取时自动补字段）还是 `validateArtifactStates`（校验时容忍/自动补）
- 是否需要 `schemaVersion` 从 1 升到 2
- 旧 state.json 里 `workflow` 字段完全缺失 vs 存在但值不完整的处理策略

## 假设

- `schemaVersion: 1` 是当前已知的唯一版本；不需要支持从更早版本迁移
- 迁移后的 state.json 需要写回磁盘（持久化），而不仅仅是内存中临时补

## Waiver

不适用。

## Requirement Review

待 `requirement-reviewer` 消费。
