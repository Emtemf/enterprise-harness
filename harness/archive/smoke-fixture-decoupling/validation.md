# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
不适用（本 change 不涉及 Java 业务代码，改动范围为 `harness/plugin/runtime/test/` 下 4 个既有测试文件的修改
+ 1 个新增 guard smoke）。

## Commands Executed

RED（Task 1，写 guard smoke 后确认违规存在）：
```
node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs red
→ fail：8 处命中（4 个文件对 gate-tightening-skeleton 的引用 + gate-hardening-review-validation-smoke.mjs
  对 intake-smoke-demo/phase0-claude-governance-skeleton/plugin-runtime-skeleton/
  reference-service-boundary-realignment 的引用）
```

逐文件修复过程中的 guard 复核（`verify` 模式，命中数递减）：
```
Task 2 后：node .../gate-hardening-fixture-guard-smoke.mjs verify → 剩 6 处命中（design-gate 文件已清零）
Task 3 后：node .../gate-hardening-fixture-guard-smoke.mjs verify → 剩 6 处命中（task-state 文件已清零，
  design-gate 未改变命中数因其本就只贡献 1 处）
Task 4 后：node .../gate-hardening-fixture-guard-smoke.mjs verify → 剩 1 处命中（review-validation 文件
  的 5 处命中全部清零，只剩 validation-digest 文件）
Task 5 后：node .../gate-hardening-fixture-guard-smoke.mjs verify → 0 处命中
```

各文件修复后的功能回归（GREEN，逐一确认原有断言未被破坏）：
```
node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs green      → Green gate-hardening-fixture-guard-smoke passed.
node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green         → Green gate-hardening design gate smoke passed.
node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green          → Green gate-hardening task-state smoke passed.
node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green   → Green gate-hardening review-validation smoke passed.
node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green   → Green gate-hardening validation-digest smoke passed.
```

结构/契约检查：
```
node harness/plugin/runtime/cli.mjs verify → OK contract checks passed.
```

最终业务验收（Task 6）：
```
node harness/plugin/runtime/cli.mjs lifecycle archive gate-tightening-skeleton
→ Archived: gate-tightening-skeleton -> harness/archive/gate-tightening-skeleton
```
归档后确认：`harness/archive/gate-tightening-skeleton/` 存在（含 change.md/design.md/evidence/reviews/specs），
`harness/changes/gate-tightening-skeleton/` 已不存在。

> **时序说明（回应 verification-reviewer advisory #1）**：`node harness/plugin/runtime/cli.mjs verify` 在
> 本 change 自身 `state=REVIEWED` 且 `validation.status` 尚未刷新为 `fresh` 之前重跑会如实报
> `REVIEWED requires fresh validation`——这与上一轮 `gate-tightening-skeleton` change 遇到的同一类过渡态
> 现象（`post-write.mjs` 编辑本 change 自己目录下的文件会把自己的 validation 标记为 stale）。本文件写定后，
> 执行 `node harness/plugin/runtime/cli.mjs lifecycle validated smoke-fixture-decoupling` 计算新鲜 digest
> 并置 `state=VALIDATED`，随后不再编辑本 change 目录下任何文件。
>
> **另外一处 advisory 已处理**：`PROGRESS.md` 的 `gate-hardening-red-task-smoke.mjs` 硬编码
> `gate-hardening-semantics` 技术债条目此前只在本 change 的 change.md/design.md 里承诺"将记入"但未实际写入，
> 现已在本次收尾一并补写到 `PROGRESS.md`（见该文件"下一步重点"章节）。

## Clarify / Requirements Confirmation
- 用户在上一轮 `gate-tightening-skeleton` change 收尾时明确要求修复此技术债（"要"）
- clarify 阶段确认采用结构性修复（清空临时副本 `harness/changes/`），而非只换个 fixture 名字的最小改动方案

## Unit Tests
不适用（无独立单元函数，guard smoke 与 4 个被修复文件都是集成/进程级测试）。

## Unit Coverage
不适用（同上）。

## Architecture Tests
不适用。

## Integration Tests
- `gate-hardening-fixture-guard-smoke.mjs`（新增）：动态枚举真实 `harness/changes/` 目录名，检查 4 个目标文件
  + guard 自身源码是否含这些字面量作为子串，直接对应本次要修的 bug（源码硬编码真实 changeId）
- 4 个被修复文件各自的既有集成测试（均通过真实 `spawnSync` 触发 `cli.mjs verify`/`verify.mjs`/`stop.mjs` 子进程，
  非字符串匹配文档文本）：修复后全部保持 GREEN，其中 `gate-hardening-review-validation-smoke.mjs` 的 5 条断言
  （`hasReviewerFailure`/`hasVerifyStaleFailure`/`hasStopReviewerBlock`/`hasStopReviewedStaleBlock`/
  `hasStopValidatedStaleBlock`）逐条确认未受影响——design review 与 plan review 均预判的
  `readdirSync` 顺序风险（`stop.mjs:53` 非聚合、首次命中即退出）经实测**未实际发生**，一次性 GREEN

## Backend API E2E
不适用。

## OpenAPI Contract
不适用。

## Google Java Style
不适用。

## Review Verdicts
- `design-reviewer`：`pass`（`reviews/design-reviewer.json`，2026-07-22，三轮修正：范围从 1 文件纠正为 4 文件 →
  发现 `normalizedReviews` 衍生耦合 → guard 自引用悖论改为动态枚举）
- `plan-critic`：`pass`（`reviews/plan-critic.json`，2026-07-22，一轮修正：guard `red` 模式极性统一、
  Task 4 风险归因精确化为 `readdirSync` 顺序）
- `verification-reviewer`：待本轮消费

## Stage Gate Summary
- clarify: 完成，用户确认结构性修复方案
- design: `design-reviewer` pass（三轮）
- plan: `plan-critic` pass（一轮）
- tdd: Task 1-6 全部 RED→GREEN，含最终业务验收（归档成功）
- verify: 待 `verification-reviewer` 消费

## Skipped Checks
- `gate-hardening-red-task-smoke.mjs` 硬编码另一个真实 changeId `gate-hardening-semantics`
  （design review 第二轮发现），明确排除在本次范围外，已记入 `PROGRESS.md` 技术债，本轮不修

## Failures and Retries
- 无生产逻辑层面的失败重试；design/plan 阶段的三轮 design review + 一轮 plan review 修正均发生在 review 阶段，
  非 TDD 阶段的 RED/GREEN 反复

## Final Verdict
Task 1-6 全部达到 GREEN；design/plan 两个 blocking gate 均已 pass；guard smoke 0 命中；4 个被修复文件功能回归
全绿；`cli.mjs verify` 全绿；最终业务验收标准（`lifecycle archive gate-tightening-skeleton`）已达成，
`gate-tightening-skeleton` 已物理归档到 `harness/archive/`。待 `verification-reviewer` 消费本文件与两份
review verdict，决定是否可进入 `VALIDATED`。
