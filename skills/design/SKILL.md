---
name: design
description: 生成 digest 绑定、可评审且可由运行时验证的技术设计制品。
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
background: false
---

# Design

只消费已确认 requirements、classification、impact 和 digest-bound research facts，产出 `design.md` 与 schema-valid `StageResult`。不替 Main 向用户提问、不写产品代码、不批准自身产物。

## 执行顺序

1. 运行 `node "${CLAUDE_SKILL_DIR}/scripts/prepare-input.mjs"`，拒绝 stage 错误、缺 requirements 或 stale input。
2. 按 [设计方法](references/method.md) 形成 design；以 [artifact 合同](references/artifact-contract.md) 约束产物形状。
3. 仅在 impact 适用时加载条件分支：[API 设计](references/api-design.md) 或 [数据设计](references/data-design.md)。
4. 依 [self-check](references/self-check.md) 自检，使用 [trace 示例](references/examples.md) 了解 trace 形状。
5. 运行 `node "${CLAUDE_SKILL_DIR}/assert/artifact-shape.mjs"`、`node "${CLAUDE_SKILL_DIR}/assert/requirement-coverage.mjs"`、`node "${CLAUDE_SKILL_DIR}/assert/traceability.mjs"`；全部通过后运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs"` 生成 `StageResult`，再用 `node "${CLAUDE_SKILL_DIR}/../../runtime/handoff.mjs" persist <change-id> <run-id> <result-path>` 持久化。
6. 将 result 交给独立 `review` run。只有 fresh `StageResult + ReviewResult + TECPC` 后才可从 design 进入 plan。

## 未决决策

缺少真实业务选择时返回 `NEEDS_DECISION`。不得从猜测生成 `pass`，也不得将自检当作 approval。

## Supporting files

- `references/method.md` — 方法、事实边界和 impact 条件分支。
- `references/artifact-contract.md` — `design.md` 与 traceability 合同。
- `references/self-check.md` — StageResult 前的确定性检查。
- `references/api-design.md` / `references/data-design.md` — 条件分支。
- `references/examples.md` — requirement trace 形状示例。
- `scripts/prepare-input.mjs` — 冻结 design 输入和 input digest。
- `scripts/finalize-result.mjs` — 汇总 assertions 并生成 StageResult。
- `assert/artifact-shape.mjs` / `assert/requirement-coverage.mjs` / `assert/traceability.mjs` — 自检断言。
