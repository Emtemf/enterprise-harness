# Tasks

Status: finalized-plan

## Preconditions
- clarify-ready: true
- design-approved: pass（见 `reviews/design-reviewer.json`）
- plan-critic verdict: pass（见 `reviews/plan-critic.json`）
- current active change: `runtime-installability-polish`

### Task 1: 用最小 smoke 锁定本地 marketplace install/update contract

**Current task sub-status**
- TEST_WRITTEN: done (historical)
- RED_VERIFIED: done (historical)
- GREEN_VERIFIED: done (historical)
- REFACTOR_VERIFIED: done (historical)
- TASK_REVIEWED: done
- DONE: implementation done; durable validation/state alignment pending in Task 3

**Files**
- Existing: `/home/wula/IdeaProjects/sdd/.claude-plugin/plugin.json`
- Existing: `/home/wula/IdeaProjects/sdd/.claude-plugin/marketplace.json`
- Existing: `/home/wula/IdeaProjects/sdd/hooks/hooks.json`
- Existing: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs`
- Consumed by Task 3: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/validation.md`

**Consumes**
- 当前 plugin metadata
- 当前 plugin-mode hooks payload
- 当前 `claude plugin` / marketplace 能力

**Produces**
- 本地 marketplace validate / add / install / list / update 的 fresh verify 证据
- Task 1 reviewer verdict
- 供 Task 3 使用的 validation/state 收口输入

**Implementation Order**
1. 先运行 installability smoke verify
2. 若失败，最小修复 plugin metadata / smoke 断言
3. 记录 fresh evidence
4. 由 Task 3 统一把 validation/state 台账吸收进去

**Test-first Order**
1. RED 历史证据已存在
2. 本轮以 fresh verify 为主

**RED Evidence Point**
- Historical command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs red`
- Historical expected failure: 当前仓库缺少 `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / plugin-mode hooks payload，导致 plugin validate 或 marketplace install contract 不满足

**GREEN / VERIFY Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs verify`
- Expected success: plugin / marketplace validate 通过，且本地 marketplace add/install/list/update contract 维持最小可用

**Refactor Boundary**
- 不扩展到公共 marketplace / registry 发布

**Acceptance Checks**
- [x] `claude plugin validate .claude-plugin/plugin.json` 通过
- [x] `claude plugin validate .claude-plugin/marketplace.json` 通过
- [x] `claude plugin marketplace add <repo>` 可识别该仓库为 marketplace
- [x] `claude plugin install enterprise-harness@enterprise-harness --scope local` 可消费
- [x] `claude plugin update enterprise-harness@enterprise-harness --scope local` 保持可用

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task1.json`

- [x] 写失败测试（历史已完成）
- [x] 运行 RED 命令（历史已完成）
- [x] 实现最小 GREEN 改动（历史已完成）
- [x] 运行 GREEN 命令（历史已完成）
- [x] 在全绿状态下重构（历史已完成）
- [x] 运行定向验证（fresh verify 已执行）
- [x] 运行 task review（已存在 `verification-reviewer-task1.json`）

### Task 2: 把普通用户文档收口成“安装插件，然后从 /harness 开始”

**Current task sub-status**
- TEST_WRITTEN: done (historical)
- RED_VERIFIED: done (historical)
- GREEN_VERIFIED: done
- REFACTOR_VERIFIED: pending
- TASK_REVIEWED: pending
- DONE: pending

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/docs/zh-cn/installation-guide.md`
- Modify: `/home/wula/IdeaProjects/sdd/docs/zh-cn/overview.md`
- Modify: `/home/wula/IdeaProjects/sdd/AGENTS.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/ONBOARDING.md`
- Existing: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs`
- Existing: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs`

**Consumes**
- Task 1 的真实 plugin / marketplace surface
- 当前 clone path / bin path / plugin path 三种入口
- 用户目标：“小白用户没有认知负载地使用我们”

**Produces**
- plugin-first + `/harness` single-entry 文档
- maintainer / 排障附录分层
- docs smoke + stage-router smoke fresh verify 证据

**Implementation Order**
1. 先运行 docs smoke verify
2. 修复 README / overview / 相关附录中仍缺的精确断言或定位冲突
3. 运行 stage-router smoke verify，证明 `/harness` 单入口合同仍成立
4. 记录 fresh evidence
5. 补 Task 2 reviewer verdict

**Test-first Order**
1. RED 历史证据已存在
2. 本轮以 fresh verify 为主

**RED Evidence Point**
- Historical command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs red`
- Historical expected failure: README/安装教程仍主要强调 clone path，且没有把 plugin marketplace 安装列为第一等入口

**GREEN / VERIFY Evidence Point**
- Command 1: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs verify`
- Command 2: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify`
- Expected success: README / installation-guide / overview / AGENTS 都对齐 plugin-first 安装口径，`ONBOARDING.md` 明确降级为 maintainer appendix，且 `/harness` 仍是单入口 stage router

**Refactor Boundary**
- 仅在文档断言全绿后整理措辞，不得删掉 fallback 路径

**Acceptance Checks**
- [x] README 明确写出 `/plugin marketplace add ...` 与 `/plugin install ...` 路径
- [x] README 明确保留 `node bin/enterprise-harness.mjs <command>` fallback
- [x] 安装教程说明 update 路径（marketplace update / plugin update）
- [x] overview / AGENTS 保持 plugin-first + `/harness` single-entry 口径
- [x] `ONBOARDING.md` 明确是 maintainer / 排障附录，不再表现为普通用户主入口
- [x] `/harness` stage-router smoke 通过

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task2.json`

- [x] 写失败测试（历史已完成）
- [x] 运行 RED 命令（历史已完成）
- [x] 实现最小 GREEN 改动（本轮已补 README/overview/ONBOARDING 定位）
- [x] 运行 GREEN / VERIFY 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 3: 把 durable validation / state 收口到已实现事实

**Current task sub-status**
- TEST_WRITTEN: not-applicable
- RED_VERIFIED: not-applicable
- GREEN_VERIFIED: pending
- REFACTOR_VERIFIED: pending
- TASK_REVIEWED: pending
- DONE: pending

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/validation.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/state.json`
- Create or modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/requirement-reviewer.json`
- Create or modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/design-reviewer.json`
- Create or modify: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/plan-critic.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task2.json`

**Consumes**
- Task 1 / Task 2 的 fresh verify 证据
- repo-level `node harness/plugin/runtime/cli.mjs verify --json`
- 当前 reviewer verdict

**Produces**
- 与仓库事实一致的 validation ledger
- 与当前实现一致的 machine-readable state
- 当前 change 的 reviewer / validation 收口

**Implementation Order**
1. 保存 requirement/design/plan reviewer verdict
2. 刷新 `validation.md`
3. 补 Task 2 reviewer verdict
4. 最后更新 `state.json`
5. 用 `node harness/plugin/runtime/lifecycle.mjs validated runtime-installability-polish` 生成 fresh digest

**Test-first Order**
1. 不新增测试脚本
2. 依赖 Task 1 / Task 2 / repo verify 的现有 deterministic evidence

**Evidence Point**
- Command 1: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
- Command 2: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs validated runtime-installability-polish 2026-07-17`
- Expected success:
  - `contractChecks.ok = true`
  - `runtimeReadinessChecks.status = not-run` 仅作为 guidance，不阻断本 change 完成
  - `state.json` 收口为：
    - `state = VALIDATED`
    - `workflow.stage = archive`
    - `workflow.clarifyReady = true`
    - `workflow.userConfirmedScope = true`
    - `workflow.planReady = true`
    - `workflow.tddStatus = refactor-verified`
    - `workflow.nextEntry = "/harness"`
    - `validation.status = fresh`

**Refactor Boundary**
- 不把 plugin install 后 hooks 真实触发写成已验证完成

**Acceptance Checks**
- [ ] `validation.md` 明确记录 installability smoke、docs smoke、stage-router smoke、repo verify 结果
- [ ] `state.json` 不再停留在 clarify/discovery/stale 的旧状态
- [ ] workflow.stage / validation / nextEntry 与 design 的目标 machine-readable 状态一致
- [ ] requirement/design/plan/task2 verification reviewer 文件齐备
- [ ] 已知未验证项（plugin hooks runtime trigger）被诚实标记为后续项

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task2.json`

- [ ] 保存 reviewer verdict
- [ ] 刷新 validation evidence
- [ ] 更新 state
- [ ] 运行 change-level verify 收口
