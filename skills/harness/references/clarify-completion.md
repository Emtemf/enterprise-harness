# Clarify Completion

Load when: controller state is active v6 Clarify with factGateOpen=false and topology confirmed, and either the Phase 2–3 component/dimension frontier is closed or the earliest invalid gate is completion-owned: debt, project-contract, final-scope, seal, classification, finalizer, or review. A pending completion disposition stays completion-owned.
Return to controller: after exactly one assessment, scope, seal, classification, finalization, or review action; re-read status and consume the fresh runtime readiness route before selecting another action.

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
   instructions。完整且无冲突时记录 `use-existing`；冲突或 defer 通过一个
   `project-contract-disposition` Decision 解决。先运行
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify validate-project-contract <change-id> harness/changes/<change-id>/project-contract-assessment.json`。
   若 status 为 `proposal-required`，必须继续完成以下安全协议，不能把“已有 assessment”误当成已处置：

   1. 仅把跨 change 稳定复用的团队规则写入提案。一次性需求、当前 change 的偏好或临时选择只留在
      requirements/decision ledger；禁止借机提升为长期契约。
   2. 路由目标：工具无关的稳定项目规则只进 `AGENTS.md`；仅 Claude Code 需要的导入、路径规则或行为约束才进
      `CLAUDE.md`、`.claude/CLAUDE.md` 或 `.claude/rules/*.md`。已有文件只能 append 或替换唯一
      Enterprise Harness managed block，必须保留块外字节。
   3. 读取 [project-contract proposal 模板](../assets/project-contract-proposal.json.tmpl)，在 change 内生成 draft，绑定
      当前 assessment、来源 Decision 与目标文件 digest；运行
      `clarify propose-project-contract <change-id> <draft-ref>` 发布 canonical immutable proposal。主 Agent 和
      subagent 都不得直接写目标 instruction file。
   4. 为该 canonical proposal 创建唯一 question candidate：`decisionType=project-contract-proposal-approval`，
      `targetRef` 和 evidenceRefs 含 proposal，inputDigests 绑定 proposal 与 assessment；选项至少为
      `approve/revise/reject`。按 [Clarify Decision 协议](clarify-decisions.md)完成 one-candidate 授权，再原样调用一次
      `AskUserQuestion`。只有用户选择 `approve` 才可继续；revise/reject 返回 completion route 重新评估。
   5. 批准后运行 `clarify apply-project-contract <change-id> <proposal-ref>`。runtime 会再次校验用户批准、CAS、
      symlink/path 边界并写 immutable application receipt；不得以 Write/Edit/Bash 代替。随后运行
      `clarify project-contract-status <change-id>`，以 assessment/receipt 为完成事实；
      `InstructionsLoaded` 仅证明 Claude Code 后续确实加载了对应 digest，是诊断信号而不是阻断 gate。
3. 用相同的 one-candidate authorization 协议取得最终 scope confirmation。读取
   lane 使用 [lane input 模板](../assets/lane-applicability-input.json.tmpl) 和
   `clarify record-lanes <change-id> <input-ref>` 原子追加；classification route 事件才使用
   [decision event 模板](../assets/decision-event.json.tmpl)写入 canonical `evidence/clarify/decision-events/<event-id>.json`，
   再用 `clarify record-decision <change-id> <event-ref>` 追加；用户 scope/debt/project-contract 决策只能走 authorized
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
6. final self-check 时读取 [共享下游坑点清单](downstream-pitfalls.md) 的 Clarify 行；只处理当前阶段命中项，
   每项绑定 durable evidence ref。命中未处置项时修复最早失效 gate，不继续创建通过结果。
7. 创建独立 `enterprise-harness:reviewer` check run。Reviewer 检查遗漏 component、事实门禁、评分依据、
   矛盾、不可验收 requirement、scope creep 与过早 design，不重新采访用户。
8. 用候选 CompletionProof 的全部前置证据计算
   `clarifyTransitionReady = canonicalStageResultValid && independentReviewPassing && tecpcComplete && requiredArtifactsFresh`。
   其中 canonical StageResult 必须通过 self-check，independent ReviewResult 必须来自不同 trusted identity/run，TECPC
   必须完整、`correction=null` 且覆盖 assertion evidence，requirements、classification、assessments、decision snapshot 和各自 digest 必须齐全且
   fresh。全部为 true 即表示 candidate proof 可派生；**persisted CompletionProof 不是此谓词的前置条件**。只报告
   重新读取 readiness；只有 runtime 同时返回 `clarifyTransitionReady=true` 与 `clarifyReadiness.route=transition` 才返回 controller 等待 T。scope confirmation 或 classification 不能单独置 true；任一前置缺失
   或绑定 artifact 修改都保持 false/C。此 reference 不加载 worker/transition reference，不生成 proof，也不执行或复制
   stage transition。

## Phase 5：后续阶段与恢复

本 reference 在此结束并返回 controller；后续 worker 与 transition 只能由新的 W/T snapshot route 选择。
