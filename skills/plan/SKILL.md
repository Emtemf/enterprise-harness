---
name: plan
description: >
  用于 Design 获批后，冻结相互独立、绑定执行策略与摘要锁定的实现任务，并明确 exact argv 和写入范围。
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
---

# Plan

本 Skill 是 Plan 阶段的执行合同。它只消费通过独立 review 的 `design.md`、
`classification.json`、`test-cases.md`、compound DesignProof、研究包和它们的冻结 digest，产出 `tasks.md` 与 schema-valid
`StageResult`。它不修改产品代码、不替 Main 向用户提问、也不批准自己的计划。

## Supporting files

- [tasks 模板](assets/tasks.md.tmpl) — 生成 tasks.md 时的输出骨架
- [assert/task-shape.mjs](assert/task-shape.mjs) — 验证 tasks.md heading、ID、required sections、strategy、argv、acceptance、recovery
- [prepare-input.mjs](scripts/prepare-input.mjs) — 只接受摘要绑定的 Plan marker
- [finalize-result.mjs](scripts/finalize-result.mjs) — 聚合 assert 结果、校验 input digest、生成 StageResult

## 输入与边界

1. 先运行 `prepare-input.mjs HANDOFF_INPUT=<canonical-input.json-path>`；`design.md`、`test-cases.md` 和 compound DesignProof 必须全部存在且 digest-bound。
2. 拒绝缺失或 digest 已变化的设计/测试用例；不从聊天摘要推断设计决定。
3. 只计划本 change 的实现面。范围不完整或需要业务取舍时返回 `NEEDS_DECISION`，包含一个
   可由 Main 直接提问的明确问题。

## 任务切片规则

每个 task 必须满足 INVEST 原则（Independent, Negotiable, Valuable, Estimable, Small,
Testable），可单独执行、审查、回滚和验证，且写明：

- 稳定 task id、目标与严格的 in/out scope；
- 要修改/新增/验证的路径和消费的设计决定；
- 一个 `executionStrategy`、其选择理由、策略特有的前置条件及 machine-generated receipt；
- 冻结的 exact argv（不得使用模糊的“run tests”）；
- 每个 task 必须映射一个或多个 `TC*`；`tdd` task 还必须指明其最小 RED case。
- 可观察的验收条件、失败恢复/回滚、适用 review rubric；
- 需要 Main 决策的依赖，而不是臆测的默认实现。

策略不是生命周期阶段：

- `tdd` 才要求真实的 RED → GREEN → REFACTOR；
- `regression` 要求 REPRODUCE → VERIFY；
- `characterization` 要求 BASELINE → VERIFY；
- `direct` 必须说明 RED 不适用并记录 VERIFY；
- `migration` 要求 DRY_RUN → APPLY → ROLLBACK；
- `generation` 要求 GENERATE → VERIFY。

## 质量闭环

1. 生成 `harness/changes/<changeId>/tasks.md`，没有未替换占位符。
2. 自检每个 task 的 design trace、路径、strategy、argv、验收、recovery 与 reviewer 输入；
   任何缺项都是 block，不以聊天补足。
3. 运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <run-id>`，由该脚本对
   `tasks.md` 形状、strategy、冻结 argv、input digest 形成 assertions 和 `selfCheck`；再用
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>`
   将结果持久化为 execute run 的 immutable `result.json`。
4. 由 Main 创建独立 `review` check run。Plan worker 的成功不等于 plan approved；只有
   digest-bound `ReviewResult` 与 runtime CompletionProof 通过后才可进入 implement。

交接前读取 [共享下游坑点清单](../harness/references/downstream-pitfalls.md) 的 Plan 行，并把命中项作为 self-check finding 处理。

## 禁止事项

- 不为 non-TDD task 强制 RED evidence。
- 不把 TODO、相对模糊命令、或“按需要修改”写入冻结计划。
- 不通过修改 `state.json` 的 ready/approved 布尔字段伪造完成。
- 不调用用户交互工具；未决业务问题只用 `NEEDS_DECISION` 返回给 Main。
