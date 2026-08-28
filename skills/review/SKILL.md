---
name: review
description: >
  用于任一阶段产出 StageResult 后，对 Harness 制品和任务结果执行独立、摘要绑定且经运行时验证的评审。
user-invocable: false
context: fork
agent: enterprise-harness:reviewer
---

# Review

本 Skill 只审阅 frozen artifact、对应的 StageResult、input digest、ResearchPacket 和 `node "${CLAUDE_SKILL_DIR}/scripts/select-rubrics.mjs"` 机械选择的 rubric。不得读取 executor transcript、共享私有推理或以 worker 自报代替证据；不得编辑 candidate 或向用户提问。

## Supporting files

- [select-rubrics.mjs](scripts/select-rubrics.mjs) — 按 stage 与 classification 机械选择评审标准
- [finalize-result.mjs](scripts/finalize-result.mjs) — 将评审 verdict 编码为 schema-valid ReviewResult
- [selected rubrics](references/) — 按 stage 选择后读取的评审标准文件
- [behavioral evals](evals/evals.json) — 4 个行为回归场景，验证 Skill 是否按意图执行

## 执行合同

1. 使用 `node "${CLAUDE_SKILL_DIR}/scripts/select-rubrics.mjs"` 按 stage 与 classification artifact 选择评审标准；check handoff 必须将选择后的 rubricIds 冻结为输入证据。
2. 逐一读取 [selected rubrics](references/) 中的选定标准，并验证每个 artifact digest 仍新鲜。
3. 用独立 check run 调用 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs"` 生成 schema-valid `ReviewResult`；再用 `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>` 持久化。runId 必须不同于 executor runId，且 `parentRunId`/`reviewedRunId` 绑定被审 StageResult 与 TECPC。
4. `pass` 才允许 `correction: null`；`block` 与 `unsupported` 必须写可执行 correction。

## Rubrics

- `scripts/select-rubrics.mjs` — 机械选择当前 stage 的 rubricIds。
- `scripts/finalize-result.mjs` — 将独立评审 verdict 编码为 schema-valid ReviewResult。

- `references/requirements.md`
- `references/classification.md`
- `references/design.md`
- `references/plan.md`
- `references/task.md`
- `references/api.md`
- `references/data.md`
- `references/architecture.md`
- `references/rule.md`
- `references/security.md`
- `references/final.md`
- `references/archive.md`

`ReviewResult` 不是批准词；runtime 只在 result schema、独立性、rubric 选择和 freshness 均通过时放行后续 transition。

给出 verdict 前读取 [共享下游坑点清单](../harness/references/downstream-pitfalls.md) 的 Review 行；命中任何未处置项时不得返回 `pass`。
