---
name: review
description: 对 Harness 制品和任务应用独立、digest 绑定且可由运行时验证的评审标准。
user-invocable: false
context: fork
agent: enterprise-harness:reviewer
background: false
---

# Review

本 Skill 只审阅 frozen artifact、对应的 StageResult、input digest、ResearchPacket 和 `scripts/select-rubrics.mjs` 机械选择的 rubric。不得读取 executor transcript、共享私有推理或以 worker 自报代替证据；不得编辑 candidate 或向用户提问。

## 执行合同

1. 使用 `scripts/select-rubrics.mjs` 按 stage 与 v6 impact 选择评审标准；check handoff 必须将选择后的 rubricIds 冻结为输入证据。
2. 逐一读取 `references/` 中的 selected rubrics，并验证每个 artifact digest 仍新鲜。
3. 用独立 check run 调用 `scripts/finalize-result.mjs` 生成 schema-valid `ReviewResult`；再用 `node runtime/handoff.mjs persist <change-id> <run-id> <result-path>` 持久化。runId 必须不同于 executor runId，且 `parentRunId`/`reviewedRunId` 绑定被审 StageResult 与 TECPC。
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
