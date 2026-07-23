# Tasks

Status: finalized-plan

> 当前 design 已通过，且 plan-critic 最新结论已降为 advisory。以下 tasks 现在作为 issue #8 的正式 plan/task artifact 使用，可进入 `TASKED`；但仍未进入 `EXECUTING`。
>
> 说明：`reviews/plan-critic.json` 是进入 `TASKED` 前的 plan-level verdict；`plan-critic-task*.json` / `verification-reviewer-task3.json` 是各 task 实施后的 task-level review 输出。
>
> 所有 task 在 REFACTOR 阶段都应先重跑对应 smoke 的 `green`，再运行 `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`，避免只验证 contract 而漏掉 task 专属行为回归。

### Task 1: 冻结 design gate / state / artifact contract，并让 verify 能识别缺口

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/specs/gate-state-contract.md`
- Modify: `/home/wula/IdeaProjects/sdd/.claude/rules/00-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/artifact-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/state.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/design-gate-missing-review/state.json`

**Consumes**
- `designApproved`
- `state.json.state`
- `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/design-reviewer.json`
- `design.md` / `change.md` / `validation.md`

**Produces**
- 明确的 design gate / state / artifact contract
- `verify` 可识别 design gate 相关的结构/状态缺口
- issue #8 的最小 smoke harness（design gate 路径）

- [x] 写失败测试
  - 在 `gate-hardening-design-gate-smoke.mjs` 中加载 `fixtures/design-gate-missing-review/state.json`，覆盖“缺 design reviewer / 缺 design approval 时不可进入下一阶段”
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs red`
  - Expected failure: `Expected DESIGN_APPROVED transition to be blocked when design reviewer verdict is missing or block`
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [x] 运行 task review
  - Reviewer: `plan-critic`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/plan-critic-task1.json`

### Task 2: 定义 plan/task gate 的最小消费模型，并把 TASKED/EXECUTING 语义固定下来

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/rules/00-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/artifact-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/tasks.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/state.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/task-gate-draft-tasks/tasks.md`

**Consumes**
- `tasks.md`
- `TASKED` / `EXECUTING`
- `currentTask`
- `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/plan-critic.json`

**Produces**
- plan/task gate 的最小可实现模型
- draft tasks 与 finalized tasks 的边界定义
- `TASKED` / `EXECUTING` 的消费语义
- issue #8 的最小 smoke harness（task state 路径）

- [x] 写失败测试
  - 在 `gate-hardening-task-state-smoke.mjs` 中加载 `fixtures/task-gate-draft-tasks/tasks.md`，覆盖“draft tasks 不得推进到 TASKED”与“EXECUTING 必须带 currentTask”
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs red`
  - Expected failure: `Expected TASKED transition to reject draft tasks or missing currentTask semantics`
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [x] 运行 task review
  - Reviewer: `plan-critic`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/plan-critic-task2.json`

### Task 3: 把 reviewer verdict / validation freshness 的消费点固定到 verify/stop/runtime contract

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/rules/70-review.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/evidence-submission.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/review-verdict.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/review-validation-stale/state.json`

**Consumes**
- reviewer verdict JSON
- `validation.status`
- `REVIEWED` / `VALIDATED` state 语义

**Produces**
- reviewer verdict 的最小 blocking matrix
- validation freshness 与 reviewer verdict 的统一消费规则
- issue #8 的最小 smoke harness（review/validation 路径）

- [x] 写失败测试
  - 在 `gate-hardening-review-validation-smoke.mjs` 中加载 `fixtures/review-validation-stale/state.json`，覆盖“blocking reviewer verdict 阻断 VALIDATED”与“stale validation 阻断完成”
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs red`
  - Expected failure: `Expected blocking review verdict or stale validation to fail verification/stop contract`
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/verification-reviewer-task3.json`

### Task 4: 把 `redVerified` 从全局布尔门禁收紧为 currentTask 级消费

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/.claude/rules/00-workflow.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/artifact-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/templates/state.json`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/gates.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/pre-write.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/red-task-missing-proof/state.json`

**Consumes**
- `gates.redVerified`
- `currentTask`
- task-level RED proof / evidence ref
- governed target gate resolution

**Produces**
- currentTask 级 `RED_VERIFIED` 最小消费模型
- production/OpenAPI 写路径对 task-scoped RED proof 的机械阻断
- issue #8 的最小 smoke harness（red gate 路径）

- [x] 写失败测试
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs red`
  - Expected failure: `Expected production/openapi writes to require currentTask-scoped red verification`
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/verification-reviewer-task4.json`

### Task 5: 把 validation digest 从调用方输入收紧为 verifier/runtime 计算

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/evidence-submission.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/artifact-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lifecycle.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/post-write.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`

**Consumes**
- `validation.digest`
- `validation.validatedAt`
- validated lifecycle action
- active change write invalidation

**Produces**
- verifier/runtime 计算的 validation digest contract
- digest mismatch / stale invalidation 的机械校验
- issue #8 的最小 smoke harness（validation digest 路径）

- [x] 写失败测试
- [x] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs red`
  - Expected failure: `Expected validated lifecycle to reject caller-supplied or stale validation digest semantics`
- [x] 实现最小 GREEN 改动
- [x] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green`
- [x] 在全绿状态下重构
- [x] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [x] 运行 task review
  - Reviewer: `verification-reviewer`
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/gate-hardening-semantics/reviews/verification-reviewer-task5.json`
