---
name: design
description: >
  Generates digest-bound, reviewable, runtime-verified technical design artifacts.
  Use when clarify has produced approved requirements.
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
background: false
---

# Design

只消费已确认 requirements、classification、impact 和 digest-bound research facts，产出 `design.md` 与 schema-valid `StageResult`。不替 Main 向用户提问、不写产品代码、不批准自身产物。只有主 Harness 可以向用户提问。

## 执行顺序

1. 运行 `node "${CLAUDE_SKILL_DIR}/scripts/prepare-input.mjs"`，拒绝 stage 错误、缺 requirements 或 stale input。
2. 开始方案比较前读取 [设计方法](references/method.md)；所有高影响决定同时读取
   [三个月不后悔门槛](references/decision-longevity.md)。以 [artifact 合同](references/artifact-contract.md)
   约束产物形状。
3. 仅在 impact 适用时加载条件分支：[API 设计](references/api-design.md) 或 [数据设计](references/data-design.md)。
4. 依 [self-check](references/self-check.md) 自检；若发现事实、替代方案、回滚或验证缺口，回到第 2 步，
   而不是用 `N/A` 掩盖。使用 [trace 示例](references/examples.md) 了解 trace 形状。
5. 运行 `node "${CLAUDE_SKILL_DIR}/assert/artifact-shape.mjs"`、`node "${CLAUDE_SKILL_DIR}/assert/requirement-coverage.mjs"`、`node "${CLAUDE_SKILL_DIR}/assert/traceability.mjs"`；全部通过后运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs"` 生成 `StageResult`，再用 `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>` 持久化。
6. 将 result 交给独立 `review` run。只有 fresh `StageResult + ReviewResult + TECPC` 后才可从 design 进入 plan。

## 未决决策

缺少真实业务选择时返回 `NEEDS_DECISION`。不得从猜测生成 `pass`，也不得将自检当作 approval。

## Supporting files

- `references/method.md` — 开始设计时读取；规定方案比较、事实边界和反馈循环。
- `references/decision-longevity.md` — 高影响或 costly-to-reverse 决定时读取；降低三个月后后悔风险。
- `references/artifact-contract.md` — `design.md` 与 traceability 合同。
- `references/self-check.md` — StageResult 前的确定性检查。
- `references/api-design.md` / `references/data-design.md` — 条件分支。
- `references/examples.md` — requirement trace 形状示例。
- `assets/design.md.tmpl` — 生成 design.md 时的输出骨架。
- `scripts/prepare-input.mjs` — 冻结 design 输入和 input digest。
- `scripts/finalize-result.mjs` — 汇总 assertions 并生成 StageResult。
- `assert/artifact-shape.mjs` / `assert/requirement-coverage.mjs` / `assert/traceability.mjs` — 自检断言。
- `evals/evals.json` — 行为回归场景；用代表性 prompt 验证 Skill 是否按意图执行。
