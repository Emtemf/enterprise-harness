---
name: verify
description: >
  Run frozen validations and collect digest-bound completion evidence.
  Use after all tasks pass with independent review.
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
background: false
---

# Verify

执行冻结验证并汇集 digest-bound 完成证据。消费已完成 task 的 receipts、self-check、
independent reviews、classification 与冻结验证 argv，产出 `validation.md` 和 schema-valid
`StageResult`。非空 waiver 在可信授权制品落地前一律 fail closed。不将自己或旧验证的结论
宣布为最终完成。

## Supporting files

- [validation 模板](assets/validation.md.tmpl) — 生成 validation.md 时的输出骨架
- [assert/validation-shape.mjs](assert/validation-shape.mjs) — 验证 validation.md heading、placeholder、required sections
- [finalize-result.mjs](scripts/finalize-result.mjs) — 汇集 validation 结果、生成 StageResult

## 冻结输入

1. 读取 v2 handoff；只消费其中真实存在且 digest 匹配的 task、review、receipt 和 design/plan 输入。
2. 先核验 classification artifact digest，再根据 `api`、`data`、`architecture`、`rule`、`security`
   选择适用 rubric/evidence；不适用维度记录 `N/A` 与理由。
3. 输入、tree、task receipt 或 review 任何一项变化均使验证 stale，必须重新执行。

## 执行与报告

- 逐个执行冻结 validation argv，记录实际 argv、exit status、开始/结束时间和输出摘要/digest。
- 汇集每个 task 的策略 receipt、self-check、独立 reviewer verdict 及适用 API/data/security
evidence；fail、skip、unsupported 必须显式保留，`unsupported` 绝不升格为 `pass`。任何非空 waiver
必须以缺少可信授权证据阻断，而不是相信 worker 提供的 `approvedBy` 字符串。
- 写入 `harness/changes/<changeId>/validation.md`，包括 target、当前 input digest、执行结果、未覆盖项、
  correction/recovery 和下一步；必须含 Commands、Results、Freshness、Coverage and exceptions 四节。
- 运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <run-id>`，将 result 用
  `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>`
  持久化为 immutable execute result。该 StageResult 必须含 assertions 与 `selfCheck`，证明本 Skill 的
  执行质量，而不代替最终 approval。

## 独立完成审查与迁移

1. 将 verify StageResult 交给 Main。
2. Main 创建新的 `review` check run；reviewer 只读取 artifact/result/receipt refs，不读取 executor
   对话，也不得复用 executor run id。
3. Runtime 仅在 fresh StageResult、self-check、独立 ReviewResult、TECPC 和 validation digest 全部匹配时
   生成 CompletionProof。只有该 proof 才允许 `verify → archive`。

范围、waiver 或验证策略存在业务取舍时，返回一个可由 Main 提问的 `NEEDS_DECISION`；只有主 Harness 可以向用户提问，不要在本 Skill 中直接用户交互或通过 state 布尔字段绕过验证。
