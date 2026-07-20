# Tasks

Status: finalized-plan

## Preconditions
- clarify-ready: true
- design-approved: pending `reviews/design-reviewer.json`
- plan-critic verdict: pass（见 `reviews/plan-critic.json`）
- current active change: `orchestrator-execution-deepening`

> 本 tasks 用于把 `orchestrator-execution-deepening` 设计拆成可执行 slice。原则：不重复做上一条 change 已完成的骨架 contract/template 收口，而是直接深化 execution-phase 行为；优先用 deterministic smoke 锁定 runner / guidance / snapshot-sync 的真实行为。

### Task 1: 收紧 execution-phase status progression contract

**Scenario contract**
- fixture change id: `execution-status-smoke`
- fixture repo shape: temp repo
- fixture event log: `harness/changes/execution-status-smoke/evidence/workflow-events.jsonl`
- fixture initial state:
  - `state = "DISCOVERED"`
  - `workflow.stage = "design"`
  - `workflow.clarifyReady = true`
  - `workflow.userConfirmedScope = true`
  - `workflow.planReady = false`
  - `workflow.tddStatus = "not-started"`
  - `workflow.nextEntry = "/harness-design"`
  - `approvals.design.status = "advisory"`
  - `approvals.design.reviewerId = "design-reviewer"`
  - `gates.designApproved = false`
- fixture required artifacts:
  - `requirements.md`
  - `change.md`
  - `design.md`
  - `state.json` (with approvals/gates projection)
  - `reviews/design-reviewer.json` (durable artifact, content consistent with projection)
- reviewer truth source for runner: `state.json.approvals.* + gates.*`
- shared inference owner: `harness/plugin/runtime/lib/workflow.mjs`
- `session-start.mjs` / `status.mjs` / `stop.mjs` 只消费 shared inference，不自行复制推断逻辑

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-status-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-start-summary-smoke.mjs`

**Consumes**
- 当前 `workflow.mjs` / `lib/workflow.mjs` 的 machine-readable result
- 当前 `status-summary.mjs` / SessionStart / Stop guidance surface
- 已完成的 first-skeleton workflow state contract

**Produces**
- execution-phase 下更稳定的 `stage / currentGap / nextAction / recommendedEntry` 语义
- SessionStart / status / Stop 在真实 active change 上的一致 guidance
- `reviews/design-reviewer.json` ↔ `state.json.approvals.design` projection 的 repo-level 校验 owner 收口到 `lib/checks.mjs`
- 普通用户不需要解释当前阶段的最小执行面

**Implementation Order**
1. 先写 execution status smoke fixture
2. 先跑 RED，确认当前 execution-phase guidance 仍不够稳定
3. 在 `workflow.mjs` / `lib/workflow.mjs` / `status-summary.mjs` 做最小 GREEN 收紧
4. 再补 SessionStart / Stop / status surface

**Test-first Order**
1. 先让 `workflow-execution-status-smoke` 在当前 repo/fixture 上失败
2. 再让 `session-start-summary-smoke` / `session-status-smoke` 对 execution-phase guidance 转绿

**RED Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs red`
- Expected failure:
  - 当前 `workflow status --json` 对 fixture change 不能返回精确的 `stage = "design"`
  - 或 `pendingDecision.kind != "execution-readiness"`
  - 或 `nextAction` 未精确指向 `workflow decide <change-id> <freeze-slice|revise-slice>` 形态
  - 或 `session-start/status/stop` 缺少 execution deepening 场景的固定 guidance token

**GREEN Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs green`
- Expected success:
  - `workflow status --json` 返回：
    - `changeId = "execution-status-smoke"`
    - `stage = "design"`
    - `pendingDecision.kind = "execution-readiness"`
    - `workflow.nextEntry = "/harness-design"`
    - `nextAction = "workflow decide execution-status-smoke freeze-slice"`
    - `currentGap = "execution deepening 第一批切片待冻结。"`
  - SessionStart 至少输出：
    - `[Harness Workflow] 当前 stage: design`
    - `[Harness Workflow] 推荐恢复入口: /harness`
    - `[Harness Workflow] 下一步动作: workflow decide execution-status-smoke freeze-slice`
  - Stop 至少输出：
    - `- 当前 workflow stage：design`
    - `- 建议下次从：/harness 恢复`

**Refactor Boundary**
- 不新增第二套 runner
- 不改变 `/harness` 作为普通用户唯一入口的前提

**Acceptance Checks**
- [x] `workflow status --json` 对 fixture change 精确返回 `stage = "design"`
- [x] `pendingDecision.kind = "execution-readiness"`
- [x] `workflow.nextEntry = "/harness-design"`
- [x] fixture 中 `reviews/design-reviewer.json` 与 `state.json.approvals.design` 一致
- [x] repo-level `verify --json` 对 reviewer artifact / projection 漂移做失败校验
- [x] SessionStart 对 fixture change 输出 `当前 stage: design` 与 `/harness`
- [x] Stop 输出当前阶段与 `/harness` 恢复入口 guidance token
- [x] `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json` 保持 `contractChecks.ok = true`

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/orchestrator-execution-deepening/reviews/verification-reviewer-task1.json`

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-execution-status-smoke.mjs verify`
- [x] 运行 task review

### Task 2: 深化 workflow decision surface，让 progression checkpoint 更真实可消费

**Checkpoint contract**
- CLI syntax: `workflow decide <change-id> <decision> [reason]`
- new `pendingDecision.kind`: `execution-readiness`
- allowed decisions: `freeze-slice`, `revise-slice`
- fixture change id: `execution-decision-smoke`
- fixture repo shape: temp repo
- fixture event log: `harness/changes/execution-decision-smoke/evidence/workflow-events.jsonl`
- precondition:
  - `workflow.stage = "design"`
  - `workflow.clarifyReady = true`
  - `workflow.userConfirmedScope = true`
  - `approvals.design.status = "advisory"`
  - `gates.designApproved = false`
  - `requirements.md` / `change.md` / `design.md` 已存在
  - `reviews/design-reviewer.json` 已存在（durable artifact），但 runner 只消费 `state.json.approvals.* + gates.*`
- precondition for `freeze-slice` extra gate:
  - `reviews/design-reviewer.json` 已存在
  - durable reviewer artifact 与 `state.json.approvals.design` projection 一致
  - `workflow decide <change-id> freeze-slice` 必须调用同一套 reviewer/projection consistency helper
  - 若 helper 返回 drift / missing-reviewer-artifact，则命令级失败且不得推进任何 state/workflow 字段
- postcondition for `freeze-slice`:
  - `gates.designApproved = true`
  - `state = "DESIGN_APPROVED"`
  - `workflow.stage = "plan"`
  - `workflow.nextEntry = "/harness-plan"`
  - `workflow.planReady = false`
  - `pendingDecision = null`
  - `nextAction = "/harness-plan"`
- postcondition for `revise-slice`:
  - fixture initial `state = "DISCOVERED"`
  - `gates.designApproved = false`
  - `workflow.stage = "design"`
  - `workflow.nextEntry = "/harness-design"`
  - `workflow.planReady = false`
  - `pendingDecision = null`
  - `nextAction = "/harness-design"`
  - `currentGap = "execution deepening 切片仍需修订。"`
  - `state = "DISCOVERED"`
  - `approvals.design` decision 前后 deep-equal
  - suppression rule:
    - 在 `harness/changes/execution-decision-smoke/design.md` 的内容 hash 再次变化前，shared inference 必须优先返回 `currentGap = "execution deepening 切片仍需修订。"`
    - 不得重新产出 `pendingDecision.kind = "execution-readiness"`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-progression-decision-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-decision-smoke.mjs`

**Consumes**
- 当前 `workflow decide` 对 `scope-confirmation` / `design-approval` 的最小支持
- 当前 pendingDecision / nextAction contract

**Produces**
- 更贴近 execution progression 的 decision kinds / payload
- 决策后 `state/workflow/nextAction/currentGap` 的一致持久化
- `/harness` 对 checkpoint 驱动更少依赖人工解释

**Implementation Order**
1. 先把 progression decision 的 fixture 固定下来
2. 跑 RED，观察当前 `decide` 对更真实 checkpoint 不可消费
3. 最小扩展 `workflow.mjs` 的 decision kind 处理
4. 再让 `/harness` 文本 contract 对齐新 decision surface

**Test-first Order**
1. 先让 `workflow-progression-decision-smoke` 失败
2. 再做最小语义扩展转绿

**RED Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-progression-decision-smoke.mjs red`
- Expected failure:
  - 当前 `workflow decide execution-decision-smoke freeze-slice` 不识别 `pendingDecision.kind = "execution-readiness"`
  - 或在 reviewer artifact 缺失 / projection 漂移时，没有命令级失败（`exit != 0`）
  - 或失败后错误地推进了 `state/workflow/gates` 字段
  - 或失败后错误写入了 `type = "decision"` 事件
  - 或识别后不能把 `freeze-slice` / `revise-slice` 的后置 state 正确持久化

**GREEN Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-progression-decision-smoke.mjs green`
- Expected success:
  - `freeze-slice` 后：
    - `gates.designApproved = true`
    - `state = "DESIGN_APPROVED"`
    - `workflow.stage = "plan"`
    - `workflow.nextEntry = "/harness-plan"`
    - `nextAction = "/harness-plan"`
    - `pendingDecision = null`
  - `revise-slice` 后：
    - `gates.designApproved = false`
    - `workflow.stage = "design"`
    - `workflow.nextEntry = "/harness-design"`
    - `nextAction = "/harness-design"`
    - `pendingDecision = null`
    - `currentGap = "execution deepening 切片仍需修订。"`
  - 失败路径（artifact 缺失 / projection 漂移）必须：
    - `exit != 0`
    - `state/workflow/gates` 保持不变
    - `workflow-events.jsonl` 不新增 `decision` 事件
  - 两种成功路径都持久化 `decision` 事件

**Refactor Boundary**
- 不把 runner 变成完整业务引擎
- 只扩到 execution progression 所需的最小 checkpoint surface

**Acceptance Checks**
- [x] `workflow decide` 能消费 `execution-readiness`
- [x] `freeze-slice` 只有在 `reviews/design-reviewer.json` 与 `state.json.approvals.design` 一致且 helper 返回通过时才允许成功
- [x] `freeze-slice` 后精确得到 `state = "DESIGN_APPROVED"`、`workflow.stage = "plan"`、`workflow.nextEntry = "/harness-plan"`、`pendingDecision = null`
- [x] `revise-slice` 后精确得到 `state = "DISCOVERED"`、`workflow.stage = "design"`、`workflow.nextEntry = "/harness-design"`、`nextAction = "/harness-design"`、`pendingDecision = null`、`currentGap = "execution deepening 切片仍需修订。"`
- [x] `approvals.design` 在决策前后 deep-equal（projection preservation）
- [x] reviewer artifact 缺失 / projection 漂移时，命令级失败且 `state/workflow/gates` 不变、`workflow-events.jsonl` 不新增 `decision`
- [x] `suppressionBaseline.designMdSha256` 被持久化，并作为唯一 reopening 基线
- [x] 在 `suppressionBaseline.designMdSha256` 变化前，不得重新产出 `pendingDecision.kind = "execution-readiness"`
- [x] 仅当 `harness/changes/execution-decision-smoke/design.md` 内容 hash 变化后，才允许 reopening `execution-readiness`
- [x] `workflow-decision-smoke` 与新 smoke 都保持通过
- [x] `.claude/skills/harness/SKILL.md` 对 execution-readiness checkpoint 的说明与 runtime contract 对齐
- [x] `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json` 保持 `contractChecks.ok = true`

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/orchestrator-execution-deepening/reviews/verification-reviewer-task2.json`

- [x] 写失败测试
- [x] 运行 RED 命令
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-progression-decision-smoke.mjs verify`
- [x] 运行 task review

### Task 3: 收紧 active change / snapshot / status summary 同步行为

**Synchronization contract**
- dynamic truth owner: `harness/ACTIVE_CHANGE + harness/changes/*/state.json`
- static snapshot role: `PROGRESS.md` 只承载阶段快照与阅读入口，不覆盖 dynamic truth
- `PROGRESS.md` 在本 task 中是 optional touched file：仅当 summary/snapshot wording 必须配合修正时才修改
- fixture change ids: `sync-smoke-a`, `sync-smoke-b`
- fixture scenario:
  - `sync-smoke-a` 初始：
    - `state = "DISCOVERED"`
    - `workflow.stage = "design"`
    - `workflow.clarifyReady = true`
    - `workflow.userConfirmedScope = true`
    - `requirements.md` 存在
    - `workflow.nextEntry = "/harness-design"`
  - `sync-smoke-b` 初始：
    - `state = "DRAFT"`
    - `workflow.stage = "clarify"`
    - `workflow.clarifyReady = true`
    - `workflow.userConfirmedScope = true`
    - `requirements.md` 不存在
    - `change.md` 存在
    - `workflow.nextEntry = "/harness"`
  - active change 从 A 切到 B
  - temp repo 中存在两个 change
  - active change 从 A 切到 B
  - `status` / `session-start` 必须优先反映 B 的 `state/workflow/currentGap/nextEntry`

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/status.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`
- Optional modify: `/home/wula/IdeaProjects/sdd/PROGRESS.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-status-smoke.mjs`

**Consumes**
- 当前 `buildStatusSummary()` 对 dynamic truth / static snapshot 的分层逻辑
- 当前 active change 切换后的 status 表达

**Produces**
- active change 与 status summary 的更稳定同步
- project snapshot / dynamic truth 分层更清晰，减少项目推进感知混乱
- 下一轮用户不再需要额外解释“现在到底到哪一步了”

**Implementation Order**
1. 写 temp-repo/fixture 驱动的 sync smoke
2. 跑 RED，确认 active change 切换后 summary/snapshot 仍易产生误读
3. 在 `status-summary.mjs` / `status.mjs` / session-start 做最小 GREEN 收紧
4. 仅在确有必要时微调 `PROGRESS.md` 的快照表述

**Test-first Order**
1. 先让 `snapshot-active-change-sync-smoke` 失败
2. 再收紧 summary 分层逻辑与展示顺序

**RED Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs red`
- Expected failure: 当前 active change 切换后，status summary 仍不能稳定体现“动态真相优先、静态快照为辅”的关系

**GREEN Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs green`
- Expected success:
  - active change 从 `sync-smoke-a` 切到 `sync-smoke-b` 后，repo-level `status --json.activeChange.changeId = "sync-smoke-b"`
  - repo-level `status --json.recommendedEntry = "/harness"`
  - repo-level `status --json.currentGap = "缺少 requirements.md。"`
  - 若修改 `PROGRESS.md`，只允许调整快照表述，不得覆盖 dynamic truth

**Refactor Boundary**
- 不把 `PROGRESS.md` 变成动态 SoT
- 继续保持 `harness/ACTIVE_CHANGE + state.json` 为动态真相

**Acceptance Checks**
- [x] active change 切换后，repo-level `status --json.activeChange.changeId = "sync-smoke-b"`
- [x] repo-level `status --json.recommendedEntry = "/harness"`
- [x] repo-level `status --json.currentGap = "缺少 requirements.md。"`
- [x] `workflow.nextEntry` 仍只存在于当前 active change 的内部状态层，不被 repo summary 镜像
- [x] 若未修改 `PROGRESS.md` 也可通过；若修改，只允许调整 `当前阶段/当前目标/下一步重点/推荐先读` 段落，且不得覆盖 dynamic truth
- [x] `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json` 保持 `contractChecks.ok = true`

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/orchestrator-execution-deepening/reviews/verification-reviewer-task3.json`

- [x] 写失败测试
- [x] 运行 RED 命令
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/snapshot-active-change-sync-smoke.mjs verify`
- [x] 运行 task review

## Notes

- 本轮不重复前一条 `clarify-first-staged-orchestrator` 已完成的 skeleton contract/template smoke。
- 本轮优先深化 execution behavior，而不是再扩新入口或新产品面。
- 真实业务执行期如果需要更多 task-level orchestration，可在本轮 runner/guidance 收紧后再继续演进。
