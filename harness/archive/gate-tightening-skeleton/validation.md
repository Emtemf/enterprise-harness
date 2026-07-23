# Validation

## Source Digest
不适用（本 change 不涉及 Java 业务代码，改动范围为 `harness/plugin/runtime/` 下 4 个 Node.js runtime 源码文件）。

## Artifact Digest
- `harness/changes/gate-tightening-skeleton/design.md`：已 `design-reviewer` pass（2026-07-22，两轮修正）
- `harness/changes/gate-tightening-skeleton/tasks.md`：已 `plan-critic` pass（2026-07-22，一轮修正）

## Commands Executed

本仓库当前没有聚合运行全部 smoke 的脚本或 CI step（已核实 `platform-smoke.yml`/`release.yml`/`prepublish.mjs`/根 `package.json` 均无此类聚合入口），以下 9 条命令均为逐一单独执行：

RED（修改生产代码前，逐一确认失败）：
```
node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs red   → Red precondition holds
node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs red  → SyntaxError（hasChangeTracking 未导出）
node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs red    → Red precondition holds
node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs red   → Red precondition holds
```

GREEN（实现后，新增 4 个测试）：
```
node harness/plugin/runtime/test/gates-governed-target-unit-smoke.mjs green    → Green gates-governed-target-unit-smoke passed.
node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs green   → Green checks-change-tracking-unit-smoke passed.
node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs green     → Green pre-write-governed-target-smoke passed.
node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs green    → Green post-write-change-tracking-smoke passed.
```

回归（既有 5 个直接 spawn 到本次改动文件的 smoke，逐一运行）：
```
node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green      → Green gate-hardening design gate smoke passed.
node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green         → Green gate-hardening red-task smoke passed.
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green → Green gate-hardening validation-digest smoke passed.
node harness/plugin/runtime/test/plugin-native-hooks-smoke.mjs green             → Green plugin-native-hooks smoke passed.
node harness/plugin/runtime/test/non-harness-entry-smoke.mjs green              → Green non-harness entry smoke passed.
```

结构/契约检查（非全量 smoke，见上方澄清）：
```
node harness/plugin/runtime/cli.mjs verify → OK contract checks passed.
```

> **时序说明（回应 verification-reviewer 第一轮 block）**：以上 `cli.mjs verify` 的通过记录采集于 Task 5 执行当时（本 change 自身 `state.json` 尚未被写为 `REVIEWED`）。`checks.mjs` 的机械规则要求 `state ∈ {REVIEWED, VALIDATED}` 时 `validation.status` 必须为 `fresh`；本 change 编辑自己目录下的文件会被 `post-write.mjs`（本次改动的一部分）如实标记为 `stale`，因此在 `state=REVIEWED` 之后、`lifecycle validated` 计算新鲜 digest 之前，重跑 `cli.mjs verify` 会如实报 `REVIEWED requires fresh validation`——这是诚实的过渡态，不是代码缺陷。verification-reviewer 已用 `git stash` 隔离验证：仅回滚本 change 的 `state.json`（保留全部代码改动）后，该检查与另外 6 个直接对活仓库跑 `cli.mjs verify`/`stop.mjs` 的既有测试（`doctor-hooks-contract-smoke.mjs`、`gate-hardening-review-validation-smoke.mjs`、`runtime-readiness-contract-smoke.mjs`、`session-contract-surface-smoke.mjs`、`stage-guidance-smoke.mjs`、`workflow-execution-status-smoke.mjs`）均转绿，证明与本次运行时代码改动无关。收尾动作：本文件写定后，执行 `node harness/plugin/runtime/cli.mjs lifecycle validated gate-tightening-skeleton` 计算新鲜 digest 并置 `state=VALIDATED`，随后不再编辑本 change 目录下任何文件（避免重新触发 stale），最终确认命令与结果见下方 Final Verdict。

## Unit Tests
- `gates-governed-target-unit-smoke.mjs`：8 组用例，覆盖向后兼容（`reference-service`）、核心修复（任意模块名 `foo-service`）、黑名单祖先段排除、包名含黑名单词不误排除、无关文件返回 `null`
- `checks-change-tracking-unit-smoke.mjs`：4 组用例，覆盖 `hasChangeTracking` 与 `isHarnessManaged` 的行为差异

## Unit Coverage
未测量行覆盖率百分比（本仓库当前对 runtime `.mjs` 脚本未接入 JaCoCo 等覆盖率工具；覆盖率门禁目前仅适用于 Java 侧 `reference-service`，与 `CLAUDE.md`「85% 覆盖率…仍在后续阶段补齐」的说明一致）。已通过 Test-first Order 逐条覆盖 design.md 列出的全部边界场景（含两轮 design review 发现的黑名单误判/漏判两个方向）。

## Architecture Tests
不适用（本 change 不改变 Java 四层架构，不涉及 `reference-service` 业务分层）。

## Integration Tests
- `pre-write-governed-target-smoke.mjs`：4 个场景，均通过真实 `spawnSync` 触发 `pre-write.mjs` 子进程（BLOCK / PASS / REMINDER-not-BLOCK / 向后兼容 BLOCK），而非字符串匹配文档文本
- `post-write-change-tracking-smoke.mjs`：3 个场景，均通过真实 `spawnSync` 触发 `post-write.mjs` 子进程

## Backend API E2E
不适用（本 change 不涉及 HTTP API）。

## OpenAPI Contract
不适用（本 change 不涉及 OpenAPI 契约变更；`validateOpenApiLight`/`validateControllerConsistency` 明确排除在本轮范围外，见 design.md Open Questions #1）。

## Google Java Style
不适用（本 change 不涉及 Java 源码）。

## Review Verdicts
- `design-reviewer`：`pass`（`reviews/design-reviewer.json`，2026-07-22，经两轮修正：黑名单只查首段 → 遍历全部 segments → 最终改为只查匹配位置之前的祖先段）
- `plan-critic`：`pass`（`reviews/plan-critic.json`，2026-07-22，经一轮修正：Task 5 补全 5 个既有 smoke 清单、澄清 `cli.mjs verify` 非全量 smoke、Task 4 断言方式具体化）
- `verification-reviewer`：第一轮 `block`（`reviews/verification-reviewer.json`，2026-07-22）——独立重跑确认 4 个新增测试与 5 个既有回归 smoke 均真实通过、RED 证据真实（`git stash` 隔离复核）、`reference-service` 向后兼容证据充分；block 的唯一原因是本文件时序表述与 `state=REVIEWED+stale` 过渡态不符，且未披露 6 个连带失败的既有测试（根因与代码改动无关，已用 `git stash` 隔离确认）。已按上方"时序说明"与下方 Final Verdict 的收尾动作解决。

## Skipped Checks
- `validateOpenApiLight`/`validateControllerConsistency` 存在同类硬编码问题（`reference-service/openapi/order-service.yaml` 等固定路径），明确记为范围外（design.md Open Questions #1），本轮未修改、未测试
- 未新增 `doctor.mjs` 层面的"扫描整个项目报告受治理路径覆盖情况"诊断命令（design.md Open Questions #2，留作 fast-follow）

## Failures and Retries
- Task 2 首次 RED 运行因 `import` 未导出目标函数而以 `SyntaxError` 形式失败退出（非预期的断言失败形式，但确认是有效 RED 证据，见 Commands Executed）
- `pre-write-governed-target-smoke.mjs`/`post-write-change-tracking-smoke.mjs` 首次编写时因测试 fixture 自身 bug（`createChangeFixture` 未先 `mkdirSync('harness')`）报 `ENOENT`，已在写 RED 证据前修正测试自身缺陷，重新确认了有效的 RED 结果（差异见上方 Commands Executed 的最终记录）

## Final Verdict
Task 1-5 全部达到 GREEN；design/plan/verify 三个 blocking gate 均已 pass（verify 经一轮修正）。收尾动作：本文件为本 change 目录下的最后一次编辑，写定后立即执行 `node harness/plugin/runtime/cli.mjs lifecycle validated gate-tightening-skeleton` 计算新鲜 digest 并置 `state=VALIDATED`，随后不再编辑本 change 目录下任何文件；再执行一次只读确认（`cli.mjs verify` + 上方披露的 6 个既有连带测试）以证明仓库回到全绿基线，确认结果记录在对话/PR 说明中，不再回写本文件（避免重新触发 stale 循环）。
