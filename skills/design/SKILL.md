---
name: design
description: 生成 digest 绑定、可评审且可由运行时验证的技术设计制品。
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
background: false
---

# Design

本 Skill 是 Design 阶段的可执行合同。它只消费已确认 requirements、classification、impact 和 digest-bound research facts，产出 durable `design.md` 与 schema-valid `StageResult`。它不替主 Harness 向用户提问、不写产品代码、不批准自身产物。只有主 Harness 可以向用户提问。

## 执行顺序

1. 运行 `scripts/prepare-input.mjs`，拒绝 stage 错误、缺 requirements 或 stale input。
2. 按 `references/method.md` 形成 design；以 `references/artifact-contract.md` 约束产物形状。
3. 仅在 impact 适用时加载条件分支：`references/api-design.md` 或 `references/data-design.md`。
4. 依 `references/self-check.md` 自检，使用 `references/examples.md` 了解 trace 形状。
5. 运行 `assert/artifact-shape.mjs`、`assert/requirement-coverage.mjs`、`assert/traceability.mjs`；全部通过后运行 `scripts/finalize-result.mjs` 生成 `StageResult`，再用 `node runtime/handoff.mjs persist <change-id> <run-id> <result-path>` 将其写入 execute run 的 immutable `result.json`。
6. 将 result 交给独立 `review` run。只有 runtime 验证 fresh `StageResult + ReviewResult + TECPC` 后，才可从 design 进入 plan。

## 未决决策

缺少真实业务选择时返回 `NEEDS_DECISION`，含一个明确、可由主 Harness 提问的决定。不得从猜测生成 `pass`，也不得将自检当作 approval。

## Supporting files

### References

- `references/method.md` — 方法、事实边界和 impact 条件分支。
- `references/artifact-contract.md` — `design.md` 与 traceability 合同。
- `references/self-check.md` — 产生 StageResult 前的确定性检查。
- `references/api-design.md` — API impact 条件分支。
- `references/data-design.md` — Data impact 条件分支。
- `references/examples.md` — 仅说明 requirement trace 形状的例子。

### Scripts and assertions

- `scripts/prepare-input.mjs` — 冻结 design 输入和 input digest。
- `scripts/finalize-result.mjs` — 汇总 assertions 并生成 schema-valid StageResult。
- `assert/artifact-shape.mjs` — 验证必要设计章节。
- `assert/requirement-coverage.mjs` — 验证 stable requirement identifier 覆盖。
- `assert/traceability.mjs` — 验证 requirement → decision → evidence trace。
