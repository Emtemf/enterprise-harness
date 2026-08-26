# Clarify Completion

Load when: controller state is active v6 Clarify with factGateOpen=false and topology confirmed, and either the Phase 2–3 component/dimension frontier is closed or the earliest invalid gate is completion-owned: debt, project-contract, final-scope, seal, classification, finalizer, review, or proof. A pending completion disposition stays completion-owned.
Return to controller: after exactly one assessment, scope, seal, classification, finalization, review, or proof action; re-read status and recompute the raw route predicates before selecting another action.

## Phase 4：确认并完成 Clarify

只有以下条件全部成立才可 finalize：

- fact gate complete，全部 required packet valid、durable、fresh；
- topology 与 deferred/non-goals 已确认；
- 所有 active component 的五个关键维度 ≥ 4，且每个 readiness predicate 都有可追溯 evidence ref；
- 没有 unresolved high-risk assumption/Decision，Acceptance 可验证；
- 用户显式确认 requirements 与执行 scope；classification 已持久化且无 placeholder。

完成后：

1. 读取 [debt assessment 模板](../assets/debt-assessment.json.tmpl)，只保留当前 change 直接触及、具有位置或
   execution evidence 的 technical debt；无相关 debt 时使用空 observations/dispositions。每个相关观察都要有
   恰好一个用户授权的 disposition event，然后运行
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify validate-debt <change-id> harness/changes/<change-id>/debt-assessment.json`。
2. 读取 [project-contract assessment 模板](../assets/project-contract-assessment.json.tmpl)，审计已有 project
   instructions。完整且无冲突时记录 `use-existing`；缺口只形成 proposal ref；冲突或 defer 通过一个
   `project-contract-disposition` Decision 解决。此 Clarify slice **不得写入 `CLAUDE.md`**，也不得创建、修改
   或应用其内容。运行
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify validate-project-contract <change-id> harness/changes/<change-id>/project-contract-assessment.json`。
3. 用相同的 one-candidate authorization 协议取得最终 scope confirmation。读取
   [decision event 模板](../assets/decision-event.json.tmpl)生成 Main/runtime 的 lane 与
   classification route 事件必须写入 canonical `evidence/clarify/decision-events/<event-id>.json`，再用
   `clarify record-decision <change-id> <event-ref>` 追加；用户 scope/debt/project-contract 决策只能走 authorized
   question hook。用 `clarify seal-decisions <change-id> <event-id>...` 密封 ordered prefix；从 requirements、
   assessments、snapshot 与 fresh packets 按 [classification input 模板](../assets/classification-input.json.tmpl)
   生成 canonical `evidence/clarify/classification-input.json`，追加匹配的
   `classification-route` 后运行 `clarify classify <change-id> <input-ref>` 原子持久化 classification 与 state ref。
   Skill 不直接 import `runtime/core`。
4. 创建 main-owned `clarify.confirmed` execute handoff，输入引用 requirements、classification、debt
   assessment、project-contract assessment、immutable decision snapshot，以及每个 required packet 所绑定的
   immutable research brief。finalizer 会按 canonical path 与 requirements 中的 runId 重新验证 artifact、
   packet、handoff/source/brief digest。
5. 此时才运行 [Clarify finalizer](../scripts/finalize-clarify-result.mjs)：
   `node "${CLAUDE_SKILL_DIR}/scripts/finalize-clarify-result.mjs" <change-id> <run-id>`。
   只接受 finalizer 成功返回的单一 persisted-result path；失败时留在 Clarify 并按错误修复 artifact。
6. 创建独立 `enterprise-harness:reviewer` check run。Reviewer 检查遗漏 component、事实门禁、评分依据、
   矛盾、不可验收 requirement、scope creep 与过早 design，不重新采访用户。
7. 只有 fresh canonical `StageResult + passing independent ReviewResult + complete TECPC + CompletionProof`
   都有效时才允许推进到 Design。scope confirmation 或 classification 不能单独推进；绑定的 artifact 修改会使
   旧结论 stale，sealed snapshot 之后的 live ledger 追加事件除外。

## Phase 5：后续阶段与恢复

Clarify 通过后、选择下一 stage worker 时才读取 [capability 映射](behavior-map.md)；每次准备
transition 时才读取 [阶段推进合同](stage-decisions.md)。不要在 Clarify 事实探索前加载它们。

- Design/Plan/Verify 使用对应 stage Skill 和独立 reviewer；`NEEDS_DECISION` 只带回一个问题给 Main。
- Implement 使用原生 worktree 隔离、冻结 task scope、machine receipt 和独立 reviewer。
- Archive 只在 completion evidence fresh 时执行。
- 任一 status/recovery 状态都立即返回 controller；controller 再按 observable state 路由到
  [entry/research authority](clarify-research.md)。本 reference 不复制 recovery 优先级或命令。
