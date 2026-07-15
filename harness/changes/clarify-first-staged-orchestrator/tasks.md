# Tasks

Status: finalized-plan

> 本 tasks 用于把 `clarify-first staged orchestrator` 设计拆成可执行 slice。当前 design review 与 plan-level critique 已达到可消费状态；本文件现在作为正式 plan artifact 使用，可用于推进到 `TASKED`。
>
> 原则：先冻结 staged workflow contract 与 templates，再接 `/harness` 路由、hooks next-stage guidance、exploration lane contract；不要第一步就散改实现。

### Task 1: 冻结 clarify-first staged workflow contract 与 durable artifact 边界

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/session-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/staged-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/directory-model.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/artifact-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/requirement-intake.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/AGENTS.md`
- Modify: `/home/wula/IdeaProjects/sdd/CLAUDE.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs`

**Consumes**
- `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md`
- `/home/wula/IdeaProjects/sdd/harness/specs/session-lifecycle.md`
- `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/design.md`

**Produces**
- `clarify -> route -> design -> plan -> tdd -> verify -> archive` 的稳定规范
- `requirements/change/design/tasks/validation/reviews/state/evidence` 的 durable workflow state 边界
- `/harness` 为唯一主用户入口、stage skill 为 subordinate recovery entry 的 repo-level contract

- [ ] 写失败测试
  - 目标：当 staged workflow spec / repo-facing contract 缺少 clarify-first、single-entry 与 durable artifact 定义时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs red`
  - Expected failure: `Expected staged workflow contract to define clarify-first phases and durable artifact boundaries`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/clarify-stage-contract-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `design-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/design-reviewer-task1.json`

### Task 2: 补 requirements/design/tasks/validation 模板，并把 enterprise design checklist 固化

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/requirements.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/change.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/design.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/tasks.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/validation.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/staged-template-smoke.mjs`

**Consumes**
- `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/design.md`
- enterprise design 必查项（接口、SQL/数据、架构边界、测试策略）

**Produces**
- requirements/design/tasks/validation 模板闭环
- `design` 阶段的 enterprise mandatory sections
- `plan` 阶段的 touched-files / RED / GREEN / commands / acceptance checks contract

- [ ] 写失败测试
  - 目标：当模板缺少 required sections（如 interface / SQL / test strategy / RED point）时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/staged-template-smoke.mjs red`
  - Expected failure: `Expected staged workflow templates to include requirements/design/plan/validation mandatory sections`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/staged-template-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `plan-critic`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/plan-critic-task2.json`

### Task 3: 把 `/harness` 升级为 stage orchestrator，并新增阶段 skill skeleton

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/skills/harness-intake/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/.claude/skills/harness-design/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/.claude/skills/harness-plan/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/.claude/skills/harness-tdd/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/.claude/skills/harness-verify/SKILL.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs`

**Consumes**
- Task 1 的 staged workflow spec
- Task 2 的模板 contract

**Produces**
- `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md` 的 stage-routing contract
- subordinate stage skill skeleton
- clarify-first / design / plan / tdd / verify 的入口职责分工

- [ ] 写失败测试
  - 目标：当 `/harness` 仍只描述总入口但没有 stage route / clarify-first / stage skill 映射时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs red`
  - Expected failure: `Expected /harness to act as a clarify-first stage router with stage skill mappings`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `design-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/design-reviewer-task3.json`

### Task 4: 升级 SessionStart / Stop / status surface，为用户自动提示当前阶段、当前缺口与恢复入口

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/stage-guidance-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-status-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-start-summary-smoke.mjs`

**Consumes**
- 当前 active change / state / staged workflow contract
- `workflow.*` 与 legacy state 的协同推断

**Produces**
- SessionStart 的“当前 stage + 当前缺口 + 推荐探索通道 + 恢复入口”提示
- Stop 的“当前停在哪一阶段 + 下次从哪恢复”提示
- status surface 的 machine-readable / human-readable guidance 闭环

- [ ] 写失败测试
  - 目标：当 SessionStart/Stop/status 仍只有状态摘要而没有 stage/gap/recovery guidance 时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/stage-guidance-smoke.mjs red`
  - Expected failure: `Expected SessionStart and Stop to provide current-stage and next-stage recovery guidance`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/stage-guidance-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/verification-reviewer-task4.json`

### Task 5A: 定稿稳定规范层的 exploration / ambiguity / context contract

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/staged-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/exploration-packet.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/ambiguity-scoring.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/context-packet.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/specs/exploration-packet.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/specs/ambiguity-scoring.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-contract-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-stable-contract-smoke.mjs`

**Consumes**
- `/home/wula/IdeaProjects/sdd/harness/specs/staged-workflow.md`
- `/home/wula/IdeaProjects/sdd/harness/specs/exploration-packet.md`
- `/home/wula/IdeaProjects/sdd/harness/specs/ambiguity-scoring.md`
- `/home/wula/IdeaProjects/sdd/harness/specs/context-packet.md`

**Produces**
- 稳定规范层的 exploration packet / ambiguity scoring / context packet 定稿
- change-local shadow copy 的“历史快照、非权威”说明

- [ ] 写失败测试
  - 目标：当 stable exploration/ambiguity/context contract 或非权威 shadow snapshot 说明缺失时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-contract-smoke.mjs red && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-stable-contract-smoke.mjs red`
  - Expected failure: `Expected clarify-first contract to define ambiguity scoring and exploration/context packet boundaries`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-contract-smoke.mjs green && node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/exploration-stable-contract-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `plan-critic`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/plan-critic-task5a.json`

### Task 5B: 对齐 exploration lane worker contract 与 orchestrator 选择规则

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/agents/code-explore.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/agents/doc-research.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/agents/impact-explore.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/skills/harness/SKILL.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/lane-worker-contract-smoke.mjs`

**Consumes**
- Task 5A 定稿后的 stable contract
- 当前 orchestrator lane routing 规则

**Produces**
- `code-explore` / `doc-research` / `impact-explore` 的 worker contract 对齐
- `/harness` 与 `workflow.mjs` 的 lane 选择逻辑一致

- [ ] 写失败测试
  - 目标：当 orchestrator lane routing 与 worker contract 不一致时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/lane-worker-contract-smoke.mjs red`
  - Expected failure: `Expected exploration lane worker contracts and lane routing logic to stay aligned`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/lane-worker-contract-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `plan-critic`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/plan-critic-task5b.json`

### Task 6A: 定义 machine-readable workflow state contract

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/staged-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/state.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-contract-smoke.mjs`

**Consumes**
- `workflow.stage`
- `workflow.clarifyReady`
- `workflow.userConfirmedScope`
- `workflow.planReady`
- `workflow.tddStatus`
- `workflow.nextEntry`

**Produces**
- machine-readable workflow state 第一版稳定 contract
- clarify-first changes 优先读取 `workflow.*` 的 schema/字段要求

- [ ] 写失败测试
  - 目标：当 workflow state 缺少 `workflow.stage / clarifyReady / userConfirmedScope / planReady / tddStatus / nextEntry` contract 时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-contract-smoke.mjs red`
  - Expected failure: `Expected workflow state contract to define machine-readable workflow fields`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-contract-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/verification-reviewer-task6a.json`

### Task 6B: 让 runtime helper / current change state 消费 machine-readable workflow

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/state.json`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/workflow.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/validation.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-consumption-smoke.mjs`

**Consumes**
- Task 6A 的 workflow state contract
- 当前 change 的 `workflow.*`

**Produces**
- runtime helper / checks 对 `workflow.*` 的实际消费
- 当前 change 的 machine-readable workflow state 基线
- SessionStart/status surface 对 `workflow.stage / nextEntry / recommendedLane / currentGap` 的一致消费

- [ ] 写失败测试
  - 目标：当 runtime helper、checks 或状态 surface 不消费 `workflow.*` 时失败
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-consumption-smoke.mjs red`
  - Expected failure: `Expected runtime helpers and checks to consume machine-readable workflow state`
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/workflow-state-consumption-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/clarify-first-staged-orchestrator/reviews/verification-reviewer-task6b.json`

## Notes

- 本轮先以 spec-first / template-first / stage-contract-first 为主，不追求第一批 task 就完成所有 runtime 行为接线。
- exploration lane 与 workflow state 已进入 contract surface，但后续“真实调度”与“自动推进”仍属于下一阶段行为深化。
- 多宿主 packaging 明确排除在本 change 外；主线只面向 Claude Code repo-native 架构。
