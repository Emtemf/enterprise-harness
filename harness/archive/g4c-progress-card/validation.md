# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
- g4c-card.mjs（纯函数，无外部依赖）
- pre-write.mjs（BLOCK + G4C 卡内联）
- session-start.mjs（G4C 卡输出）
- status-summary.mjs（G4C 卡集成到 cli status）
- state-migration.mjs（v2→v3 迁移）
- state.json schema v3（goal/successCriteria/routingReason）

## Commands Executed
- `node harness/plugin/runtime/test/g4c-card-smoke.mjs green/verify`
- `node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs green/verify`
- `node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs green/verify`
- `node harness/plugin/runtime/test/subagent-contract-smoke.mjs verify`
- `node harness/plugin/runtime/test/orchestration-guardrail-smoke.mjs verify`
- `node harness/plugin/runtime/test/lane-worker-contract-smoke.mjs verify`
- `node harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify`
- `node harness/plugin/runtime/test/mandatory-gate-contract-smoke.mjs verify`
- `node harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs verify`
- `node harness/plugin/runtime/cli.mjs verify`

## Unit Tests
- `g4c-card-smoke.mjs`：7 个场景（goal 有/无、routingReason、阶梯三态、7 stage 全覆盖、Correction、紧凑度 ≤20 行）
- `state-migration-backward-compat-smoke.mjs`：7 个场景（v1→v2→v3 链式迁移、G4C 字段补齐、disk 持久化）

## Integration Tests
- pre-write BLOCK 消息含 G4C 卡：通过 `blockGoverned()` 内联
- session-start 输出含 `[Harness 进度卡]` 标记
- `cli.mjs status` 输出含 G4C 卡

## Review Verdicts
- design-reviewer.json: pass（已有）

## Stage Gate Summary
- clarify: ✓ requirements.md + userConfirmedScope
- route: ✓ tier=L2
- design: ✓ design.md + design-reviewer pass
- plan: ✓ tasks.md
- tdd: N/A（纯 runtime 变更，无 Java TDD）
- verify: ✓ 全量 smoke + cli verify 通过

## Skipped Checks
- Unit coverage：纯函数，无复杂分支，smoke 覆盖核心路径
- ArchUnit：N/A（非 Java 分层变更）
- Backend API E2E：N/A（非 API 变更）

## Failures and Retries
- 无

## Final Verdict
PASS — 全部 smoke 测试通过，G4C 卡三处回显正常，旧 state 迁移兼容。
