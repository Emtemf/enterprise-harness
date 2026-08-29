---
name: archive
description: >
  用于 Verify 产出通过的 CompletionProof 后，校验新鲜完成证据并归档不可变变更历史。
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
---

# Archive

本 Skill 是 Archive 阶段的完成性检查合同。它不制造验证结论，也不接受聊天中的“已完成”；只消费
runtime 生成的 fresh CompletionProof、验证 artifact 和独立 archive-completeness review。未满足条件的
change 必须保持 active 或显式 abandon，绝不能伪装归档。

## Supporting files

- [finalize-result.mjs](scripts/finalize-result.mjs) — 校验 CompletionProof 与 archive inputs、生成 StageResult
- [behavioral evals](evals/evals.json) — 4 个行为回归场景，验证 Skill 是否按意图执行

## 归档前检查

1. 验证当前 state 已由 runtime 推进到 `archive`；`archive` 命令必须先在 `verify` 阶段验证并持久化 fresh Verify CompletionProof，然后只推进 stage，不做物理移动。
2. 读取并重新校验 Verify CompletionProof：execution run、review run、artifact/input digest、TECPC 与
   `validation.status=fresh` 必须全部匹配当前 durable 文件。
3. 确认所有适用 rubrics、receipt、scope decisions、`test-cases.md`、compound DesignProof 和 required artifacts 已闭合；stale、missing、
   `block`、任何非空 waiver 或 `unsupported` 一律阻断。
4. 自检源/目标路径安全、归档目标不存在、历史目录不会覆盖；归档 evidence 不得从 `harness/archive/**`
   修改或补造。

## 质量闭环

- 产出 archive StageResult：先运行 `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <run-id>`，
  它检查 verify CompletionProof 与 archive inputs，并一次性写入唯一 `evidence/archive-manifest.json`（test-cases、test-design result/review run refs、DesignProof refs）；再用
  `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>`
  持久化 assertions、`selfCheck` 与 TECPC。
- Main 创建独立 `review` check run；archive worker 的自检不是完成 verdict。
- runtime 验证 fresh Archive StageResult + independent ReviewResult 后，Main 必须运行
  `node "${CLAUDE_PLUGIN_ROOT}/runtime/lifecycle.mjs" archive-finalize <change-id>`；该命令生成 Archive CompletionProof、CAS 更新
  lifecycle、物理移动 change 并清理 compatibility pointer。移动后历史不可变。

## 边界

- 只清理 compatibility pointer，session/lease/lock 属于 common-dir coordination，不属于归档业务证据。
- 不可逆/未完成内容使用 `abandon <changeId> <reason>`，保留原因和证据。
- 需要用户决定保留、waive 或 abandon 的情况，返回明确 `NEEDS_DECISION` 给 Main；不自行询问用户。

物理移动前读取 [共享下游坑点清单](../harness/references/downstream-pitfalls.md) 的 Archive 行；命中部分发布、指针残留或历史覆盖风险时必须停止。
