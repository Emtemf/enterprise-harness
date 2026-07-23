# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
- `harness/plugin/runtime/lib/state-migration.mjs`：新增迁移模块
- `harness/plugin/runtime/lib/gates.mjs`：`loadActiveChange` 集成迁移
- `harness/templates/state.json`：schemaVersion 1 → 2

## Commands Executed

RED：
```
node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs red
# Red precondition holds: migration not yet implemented.
```

GREEN：
```
node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs green
# Green state-migration-backward-compat-smoke passed.
```

回归（全部 smoke + cli.mjs verify）：
```
node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green
node harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs green
node harness/plugin/runtime/test/non-harness-entry-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green
node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green
node harness/plugin/runtime/cli.mjs verify
# OK contract checks passed.
```

## Unit Tests
- `state-migration-backward-compat-smoke.mjs`：6 组用例覆盖 version 1→2 迁移的全部场景

## Unit Coverage
不适用（未接入覆盖率工具）

## Architecture Tests
不适用。

## Integration Tests
- `state-migration-backward-compat-smoke.mjs`：真实读写临时目录的 state.json，验证迁移逻辑与磁盘持久化

## Backend API E2E
不适用。

## OpenAPI Contract
不适用。

## Google Java Style
不适用。

## Review Verdicts
- `design-reviewer`：`advisory`（2026-07-23，非阻断，关键建议已吸收进 design.md）
- `plan-critic`：待本轮 verify 阶段消费

## Stage Gate Summary
- clarify: 完成（schemaVersion 升级 + 读取时迁移）
- design: advisory（已吸收 F1/F2/F3/F4）
- plan: tasks.md 已完成
- tdd: Task 1-3 已完成
- verify: 待验证

## Skipped Checks
- `validateOpenApiLight`/`validateControllerConsistency` 硬编码问题不在本次范围（已在 `openapi-contract-check-generalization` 中处理或记为已知技术债）

## Failures and Retries
- Task 1 首次实现时测试 fixture 缺少 `validateArtifactStates` 所需的 artifact 文件（`design.md`/`tasks.md`/`reviews/` 等），导致误报非 migration 问题的校验错误；已补齐 fixture 文件

## Final Verdict
本 change 已完成核心目标：旧版本 state.json（schemaVersion=1，缺 `workflow.*`/`gates.redTask`/`gates.redEvidenceRef`）在新代码下自动迁移至 schemaVersion 2，`validateArtifactStates` 无错误，磁盘已持久化。全部既有 smoke 通过，`cli.mjs verify` 全绿。待 release。
