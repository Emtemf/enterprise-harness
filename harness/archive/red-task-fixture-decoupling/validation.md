# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
不适用（本 change 只修改 1 个测试文件并新增 1 个 guard smoke）。

## Commands Executed

RED（Task 1）：
```bash
node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs red
# -> fail，命中 gate-hardening-red-task-smoke.mjs: gate-hardening-semantics
```

GREEN / 最终业务验收：
```bash
node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs green
# -> Green gate-hardening-red-task-fixture-guard-smoke passed.

node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green
# -> Green gate-hardening red-task smoke passed.

node harness/plugin/runtime/cli.mjs verify
# -> OK contract checks passed.

node harness/plugin/runtime/cli.mjs lifecycle archive gate-hardening-semantics
# -> Archived: gate-hardening-semantics -> harness/archive/gate-hardening-semantics
```

## Clarify / Requirements Confirmation
- 用户已确认采用结构性修复（清空临时副本 `harness/changes/`，只注入 synthetic fixture），不走“只是换个专用名字”的最小改动路线。

## Unit Tests
不适用（无独立纯函数级单元；本轮 guard smoke + 既有 smoke 都属于进程/集成级测试）。

## Unit Coverage
不适用。

## Architecture Tests
不适用。

## Integration Tests
- `gate-hardening-red-task-fixture-guard-smoke.mjs`：动态枚举真实 `harness/changes/` 目录名，验证
  `gate-hardening-red-task-smoke.mjs` 源码不再硬编码任何真实 changeId
- `gate-hardening-red-task-smoke.mjs`：真实 `spawnSync` 触发 `pre-write.mjs`，验证
  - 缺少 `currentTask-scoped red verification` 时 BLOCK
  - `redTask` / `redEvidenceRef` 对齐后 PASS

## Backend API E2E
不适用。

## OpenAPI Contract
不适用。

## Google Java Style
不适用。

## Review Verdicts
- `design-reviewer`：`advisory`（2026-07-22；唯一建议是显式改写 synthetic fixture 的 `changeId`，已在实现中采纳）
- `plan-critic`：`pass`（2026-07-22；要求补 `mkdirSync` 重建 synthetic fixture 目录，已在实现中采纳）
- `verification-reviewer`：待本轮 verify 阶段消费

## Stage Gate Summary
- clarify: 完成（用户确认结构性修复）
- design: advisory / non-blocking（关键建议已采纳）
- plan: `plan-critic` pass
- tdd: Task 1-3 已完成 RED→GREEN→REFACTOR
- verify: 待 `verification-reviewer` 消费

## Skipped Checks
- 未扩展到其他测试文件的同类问题（本轮只处理 `gate-hardening-red-task-smoke.mjs` 这一处剩余硬编码）

## Failures and Retries
- 无额外重试；一次性完成 guard RED、实现、GREEN、verify、archive

## Final Verdict
本 change 已完成其唯一业务目标：`gate-hardening-red-task-smoke.mjs` 不再引用真实业务 change `gate-hardening-semantics`，
且 `gate-hardening-semantics` 已成功归档到 `harness/archive/`。

> **时序说明（回应 verification-reviewer block）**：上方记录的 `node harness/plugin/runtime/cli.mjs verify -> OK contract checks passed.`
> 采集于本 change 被写成 `REVIEWED` 之前；一旦 `state=REVIEWED`，仓库自己的门禁要求 `validation.status=fresh`，否则会如实报
> `REVIEWED requires fresh validation`。因此本文件写定后，收尾动作是：执行
> `node harness/plugin/runtime/cli.mjs lifecycle validated red-task-fixture-decoupling` 计算 fresh digest，再**不修改本 change 目录下任何文件**，随后重新跑：
> - `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs green`
> - `node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green`
> - `node harness/plugin/runtime/cli.mjs verify`
> 只有最后一条重新回到 `OK contract checks passed.`，本 change 才能进入 `VALIDATED`。
