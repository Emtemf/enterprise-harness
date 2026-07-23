# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
不适用（本 change 只修改 1 个测试文件）。

## Commands Executed

RED 证据采集（安全流程：快照→观察污染→恢复→二次确认）：
```
步骤1-5 命令与输出：
snapshot: existed=1 content=[workflow-runner-fixture-isolation]
confirmed: test-runner-smoke not present before RED collection
exit=0
after-run: ACTIVE_CHANGE=[test-runner-smoke]（RED 核心证据：ACTIVE_CHANGE 被污染）
恢复后: ACTIVE_CHANGE=[workflow-runner-fixture-isolation]，confirmed: cleaned up
```

GREEN：
```
node harness/plugin/runtime/test/workflow-runner-smoke.mjs green
-> Green workflow-runner smoke passed.
```

回归（真实仓库未被污染 + 既有 verify）：
```
PASS: ACTIVE_CHANGE unchanged
PASS: no /tmp leak
PASS: test-runner-smoke not present in real repo
node harness/plugin/runtime/cli.mjs verify
-> OK contract checks passed.
```

## Unit Tests
不适用（无独立纯函数级单元）

## Integration Tests
- `workflow-runner-smoke.mjs`：真实 `spawnSync` 触发 `workflow.mjs run/resume/status`，在临时副本内验证原有 4 项断言
- `process.on('exit', cleanup)` 正确接线：`/tmp` 泄漏检查验证临时副本在每次运行后被清理

## Backend API E2E
不适用。

## OpenAPI Contract
不适用。

## Google Java Style
不适用。

## Review Verdicts
- `design-reviewer`：`pass`（2026-07-22，一轮修正：repoRoot 保持动态计算、RED 采集安全性）
- `plan-critic`：`pass`（2026-07-22，一轮修正：red/green 模式副作用一致性、ACTIVE_CHANGE 存在性边界、`process.exit` 跳过 `finally` 的清理机制）
- `verification-reviewer`：待本轮消费

## Stage Gate Summary
- clarify: 完成
- design: `design-reviewer` pass
- plan: `plan-critic` pass
- tdd: Task 1-3 已完成 RED→GREEN→REFACTOR
- verify: 待 `verification-reviewer` 消费

## Skipped Checks
不适用

## Failures and Retries
- design/plan 阶段各有一轮 review block 并在进入 TDD 前修正：
  - design-reviewer 抓到 RED 采集安全性和 repoRoot 计算方式
  - plan-critic 抓到 red/green 模式副作用一致性、ACTIVE_CHANGE 存在性边界、`process.exit` 跳过 `finally` 的清理机制

## Final Verdict
本 change 已完成其唯一业务目标：`workflow-runner-smoke.mjs` 不再污染真实仓库的 `harness/ACTIVE_CHANGE` 或 `harness/changes/test-runner-smoke/`，全部在临时副本内运行，且 `/tmp` 无泄漏。待 `verification-reviewer` 消费后将本 change 收口为 `VALIDATED`。
