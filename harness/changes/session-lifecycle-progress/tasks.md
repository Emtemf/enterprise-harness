# Tasks

Status: finalized-plan

> 当前 `requirement-reviewer`、`design-reviewer` 与 `plan-critic` 的最新结论均已 non-block。以下 tasks 现在作为 `session-lifecycle-progress` 的正式 plan/task artifact 使用，可进入 `TASKED`；但仍未进入 `EXECUTING`。
>
> 首次进入 Task 1 时，应先创建 `harness/plugin/runtime/test/` 与后续需要的 `harness/plugin/runtime/test/fixtures/` 目录。
>
> 依赖关系：
> - Task 1 先产出 `PROGRESS.md`、`harness/specs/session-lifecycle.md` 与 `status-summary` 契约
> - Task 2 / Task 3 / Task 4 默认依赖 Task 1 的这些产物

### Task 1: 新增 `PROGRESS.md`、session lifecycle spec、`status` 命令与稳定输出契约

**Files**
- Create: `/home/wula/IdeaProjects/sdd/PROGRESS.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/specs/session-lifecycle.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/status.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-status-smoke.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/package.json`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/manifest.json`

**Consumes**
- `loadActiveChange(root)`
- `harness/changes/*/state.json`
- `harness/specs/mvp-roadmap.md`
- `package.json`
- `harness/plugin/manifest.json`

**Produces**
- `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs status`
- `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs status --json`
- `PROGRESS.md`
- `harness/specs/session-lifecycle.md`
- `session-status-smoke.mjs`

- [ ] 写失败测试
  - 在 `session-status-smoke.mjs` 中覆盖 `status` 不存在、`--json` 契约缺失、以及 package/manifest 未接线三类失败信号
- [ ] 运行 RED 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs red`
  - Expected failure: `Expected status command, status --json contract, or package/manifest wiring to be missing before implementation`
- [ ] 实现最小 GREEN 改动
  - 新增 progress surface 与 status summary builder
  - 把 `status` 接入 runtime CLI、package scripts 与 manifest
  - 固定 `status --json` 顶层字段
- [ ] 运行 GREEN 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs verify`
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/session-lifecycle-progress/reviews/task1-plan-critic.json`

### Task 2: 强化 SessionStart 摘要并复用 status summary

**Dependency Note**
- 本 task 依赖 Task 1 已产出可复用的 `status-summary` 输出契约；否则 SessionStart 只能回退为临时文案拼接，不符合本轮设计。

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/session-start.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/status-summary.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-start-summary-smoke.mjs`

**Consumes**
- `buildStatusSummary(root)`
- `PROGRESS.md`
- `harness/ACTIVE_CHANGE`
- `harness/changes/*/state.json`

**Produces**
- SessionStart 输出固定标题、progress source、active change 与 `status` 入口
- `session-start-summary-smoke.mjs`

- [ ] 写失败测试
  - 在 `session-start-summary-smoke.mjs` 中覆盖“缺少 `PROGRESS.md` 指针 / 缺少 active change 摘要 / 缺少 `status` 入口”的失败路径
- [ ] 运行 RED 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs red`
  - Expected failure: `Expected SessionStart summary to omit progress source, active change summary, or status command hint before implementation`
- [ ] 实现最小 GREEN 改动
  - 在 SessionStart 中接入 status summary
  - 保持启动输出简短，但固定关键标题与指针
- [ ] 运行 GREEN 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
- [ ] 运行 task review
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/session-lifecycle-progress/reviews/task2-plan-critic.json`

### Task 3: 把 progress surface 接入 contract 校验与 repo-facing 文档入口

**Dependency Note**
- 本 task 不是 SessionStart 的附属步骤；它必须独立证明 `doctor` / `verify` / `full-verify` 与 repo-facing 文档入口都已感知新的 progress assets。

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/doctor.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/AGENTS.md`
- Modify: `/home/wula/IdeaProjects/sdd/CLAUDE.md`
- Modify: `/home/wula/IdeaProjects/sdd/docs/zh-cn/overview.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/directory-model.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/session-contract-surface-smoke.mjs`

**Consumes**
- `PROGRESS.md`
- `harness/specs/session-lifecycle.md`
- `doctor.mjs`
- `verify.mjs`
- `hooks/full-verify.sh`

**Produces**
- `doctor` / `verify` / `full-verify` 感知新的 progress assets
- repo-facing 文档入口能指向 `PROGRESS.md` 与 `session-lifecycle.md`
- `session-contract-surface-smoke.mjs`

- [ ] 写失败测试
  - 在 `session-contract-surface-smoke.mjs` 中分别覆盖：`doctor` 未列出 `PROGRESS.md` / `session-lifecycle.md`、`verify` 的 required paths 未接线、`full-verify` 未经过 shell 结构校验、repo-facing 文档缺入口 四类失败路径
- [ ] 运行 RED 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs red`
  - Expected failure: `Expected doctor, verify, full-verify, or repo-facing doc entrypoints to miss PROGRESS.md or session-lifecycle.md before implementation`
- [ ] 实现最小 GREEN 改动
  - 把 `PROGRESS.md` 与 `harness/specs/session-lifecycle.md` 接入结构校验与文档入口
- [ ] 运行 GREEN 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs verify`
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
  - Command: `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`
- [ ] 运行 task review
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/session-lifecycle-progress/reviews/task3-plan-critic.json`

### Task 4: 收紧 Stop handoff guidance 并保留现有 validation block 语义

**Dependency Note**
- 本 task 依赖 Task 1 已创建 `PROGRESS.md` 与 `harness/specs/session-lifecycle.md`，否则 Stop 无法引用统一的静态快照与 handoff contract。

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/hooks/stop.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/PROGRESS.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/session-lifecycle.md`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/stop-handoff-smoke.mjs`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/stop-handoff-missing-validation/state.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/fixtures/stop-handoff-stale-validation/state.json`

**Consumes**
- `loadActiveChange(root)`
- `validation.md`
- `PROGRESS.md`
- `harness/specs/session-lifecycle.md`

**Produces**
- Stop 输出明确的 repo handoff / memory 分流规则
- 缺 validation.md / stale validation 的退出语义保持不变
- `stop-handoff-smoke.mjs`

- [ ] 写失败测试
  - 在 `stop-handoff-smoke.mjs` 中同时覆盖“缺 handoff guidance”与“validation block 语义回归”的失败路径
- [ ] 运行 RED 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs red`
  - Expected failure: `Expected Stop guidance or validation block contract to be incomplete before implementation`
- [ ] 实现最小 GREEN 改动
  - 保留现有 validation block
  - 新增 change-specific / repo-level / memory 三路分流提醒
- [ ] 运行 GREEN 命令
  - Command: `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs green`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`
- [ ] 运行 task review
  - Output: `/home/wula/IdeaProjects/sdd/harness/changes/session-lifecycle-progress/reviews/task4-plan-critic.json`
