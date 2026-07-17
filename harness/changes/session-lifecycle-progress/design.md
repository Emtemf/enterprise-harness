# Design

## Requirement Alignment

本轮要补的是 Enterprise Harness 的 session lifecycle 缺口，而不是再堆一层零散文档。

这是一条 **L3 平台规则 / 架构语义收紧** 变更，必须满足的三件事：

1. 新会话能更快定位“这是什么系统 / 怎么组织 / 怎么跑 / 怎么验证 / 现在做到哪里”
2. repo 内出现一个明确的 progress surface，而不是继续让“当前状态”分散在多个文件里
3. Stop 阶段把 durable handoff 与 memory 边界说清楚，但不虚构“自动写 memory”能力

## Current-State Evidence

当前关键现状如下：

- `README.md`、`AGENTS.md`、`CLAUDE.md` 已基本覆盖系统定位、入口模型、运行命令与验证入口
- Node `SessionStart` hook 只输出目录存在性检查与入口提示，无法反映 active change / 当前阶段 / progress source
- Node `Stop` hook 只做 validation freshness 门禁，没有告诉使用者“跨会话结论该落到哪里”
- 当前 repo 根没有统一的 `PROGRESS.md` 或 `STATUS.md`
- 当前动态状态的真相其实已经存在：`harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json`

## Options Considered

### Option A：只新增静态 `PROGRESS.md`

用一页文档回答“现在做到哪里了”，但不新增动态 status summary，也不改 hooks。

### Option B：只新增动态 `status` 命令

完全靠 runtime 命令生成当前状态，不新增 repo-facing 静态进度面。

### Option C：静态 `PROGRESS.md` + 动态 `status` 命令 + hook 摘要

把“长期阶段快照”与“当前动态状态”分开：

- 静态层：`README.md` / `AGENTS.md` / `CLAUDE.md` / `PROGRESS.md` / `harness/specs/session-lifecycle.md`
- 动态层：`status` 命令、`SessionStart` hook、`Stop` hook

## Selected Option and Rationale

选择 **Option C**。

理由：

- 只做静态文档会很快过期，且仍不能在新会话打开时快速回答 active change / validation 状态
- 只做动态命令又会缺一个 repo-facing 的总览前门，不符合用户对 `PROGRESS.md` 类文档的预期
- 双层模型可以把“长期说明”和“当前状态”拆开，降低文档过期风险
- 将 `status` 定义为新的 top-level runtime CLI 子命令，能够避免 `lifecycle.mjs` 继续混入 session/progress 语义，保持命令面更清楚

## Rejected Options

拒绝以下方案：

- 在 Stop hook 中宣称“自动把记忆写入 Claude memory”
- 新建一套独立于 `harness/changes/*/state.json` 的 session 状态存储
- 让 `PROGRESS.md` 直接从 git 历史自动实时生成
- 把当前状态摘要塞进 `lifecycle.mjs` 作为新的 action，造成命令面语义重叠

## Affected Layers

- repo-facing docs：`README.md`、`AGENTS.md`、`CLAUDE.md`、`PROGRESS.md`
- stable spec：`harness/specs/session-lifecycle.md`
- runtime CLI：新增 `status` 命令
- runtime hooks：`session-start.mjs`、`stop.mjs`
- runtime verification：`doctor.mjs`、`lib/checks.mjs`、`hooks/validate-spec-structure.sh`

## Cross-layer Type and Mapper Matrix

| Source | Target | 责任层 | 方式 |
|---|---|---|---|
| `README.md` / `AGENTS.md` / `CLAUDE.md` | 新会话的人类可读理解 | repo contract | 静态入口文档 |
| `PROGRESS.md` | 阶段性进度快照 | repo contract | 静态进度面 |
| `harness/ACTIVE_CHANGE` + `state.json` | 终端中的当前状态摘要 | runtime | `status` summary builder |
| stop guidance | durable handoff 提醒 | runtime hook | 明确文本提醒，不自动落盘 |

## Repository Port Design

不适用。本轮不涉及 Java repository port 或业务代码依赖方向变更。

## API Contract

不新增业务 API，也不修改 OpenAPI 契约。

如果新增 runtime CLI `status` 子命令，其职责仅是本地状态摘要，不属于对外业务 API；同时它作为新的 top-level CLI 命令接入，而不是 `lifecycle` 的子动作。

## Data Design

不新增数据库结构，不新增业务持久化模型。

repo 内唯一新增的静态资产是 `PROGRESS.md` 与 `harness/specs/session-lifecycle.md`。

### Progress Source of Truth

本轮明确三层信息边界：

1. **当前动态状态真相**：`harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json`
   - 回答：当前 active change 是谁、处于哪个 state、validation 是否 fresh、有没有 blockers
   - 一旦与静态文档冲突，以这里为准
2. **阶段性快照与入口索引**：`PROGRESS.md`
   - 回答：项目当前大阶段、最近完成什么、下一步主要缺口、建议先读哪些文件
   - 它是人工维护的 repo-facing snapshot，不承担动态 truth 职责
3. **长效规则与运行合同**：`README.md` / `AGENTS.md` / `CLAUDE.md` / `harness/specs/session-lifecycle.md`
   - 回答：系统是什么、如何组织、怎么跑、怎么验证、handoff 规则是什么

## Durable Handoff Routing

Stop 阶段的目标不是自动落盘，而是把“该写到哪里”说清楚。

因此本轮固定如下分流规则：

- **change-specific 结论**：写回当前 change 资产
  - `change.md`
  - `design.md`
  - `tasks.md`
  - `validation.md`
  - `evidence/*.md`
  - `reviews/*.json`
- **repo-level 阶段信息**：写回 `PROGRESS.md`
  - 当前整体做到哪一阶段
  - 最近完成的 slice / capability
  - 下一批全局重点
- **Claude memory**：只允许保存 repo 中没有记录、但跨会话仍有价值的非仓库事实
  - 例如用户偏好、外部参考、非仓库状态说明
  - 必须是显式动作，不能冒充 repo 内建自动机制
- **聊天记录**：可以作为证据来源，但不是仓库真相，也不能替代上述正式资产

### Recommended Stop Handoff Contract

实现阶段应把上述分流规则落成可直接执行的话术，而不是只给抽象提醒。最低应能明确提示：

1. 如果本次会话改变了当前 change 的范围、设计、任务、验证、评审结论，先更新当前 active change 下的对应资产
2. 如果本次会话推进的是全局阶段、能力面或下一步优先级，再更新 `PROGRESS.md`
3. 如果本次会话还产生了 repo 中没有记录、但未来会继续影响协作的非仓库事实，才考虑显式写入 Claude memory
4. 不得把“聊天里已经说过”当成 durable handoff 完成条件

## Status Output Contract

为避免验证只依赖 `grep` 文案，本轮要求 `status` 至少支持稳定的 `--json` 输出。

建议固定以下顶层字段：

- `summaryVersion`
- `currentPhase`
- `progressSnapshot`
- `activeChange`
- `truthSources`
- `nextRead`
- `nextCommands`

默认人类可读输出也应保留固定标题，供 SessionStart/Stop 摘要复用。至少包括：

- `当前阶段`
- `静态快照`
- `动态真相`
- `下一步阅读`
- `下一步命令`

## Error Handling

- `status` 命令在没有 `ACTIVE_CHANGE` 时必须正常输出，而不是失败退出
- `SessionStart` hook 应输出短摘要与明确指针，不因缺少 active change 而报错
- `Stop` hook 继续保留现有 validation freshness block；新增的 handoff guidance 只作为提醒，不改变已有 block 语义
- 当静态 `PROGRESS.md` 与动态 state 不一致时，应以 `harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json` 作为动态真相
- 当需要写 memory 但没有显式动作时，Stop 只能提醒“可写什么”，不能伪造“已写入”状态

## Transaction Boundaries

不适用。本轮不涉及业务事务边界。

## Testing Strategy

本轮遵循 TDD，但避免只靠脆弱的 shell 文案匹配。

### 1. `status` 命令与输出契约
- RED：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs status`
  - 预期失败：`Unknown command: status`
- GREEN：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-status-smoke.mjs green`
  - 断言：`status --json` 存在稳定字段，且 package.json / manifest 接线可观察

### 2. SessionStart 摘要
- RED：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs red`
  - 预期失败：当前摘要缺 `PROGRESS.md`、active change 或 `status` 入口指针
- GREEN：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-start-summary-smoke.mjs green`
  - 断言：SessionStart 输出固定标题与核心指针，且不误报缺少 active change 为错误

### 3. contract 校验接线
- RED：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs red`
  - 预期失败：`doctor` / `verify` / `full-verify` 尚未感知 `PROGRESS.md` 与 `harness/specs/session-lifecycle.md`
- GREEN：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/session-contract-surface-smoke.mjs green`
  - 断言：required paths 与 repo-facing 文档入口已接通

### 4. Stop handoff guidance 与 validation block 保护
- RED：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs red`
  - 预期失败：当前 Stop 没有 repo handoff / memory 分流规则，且未验证 stale validation block 保持不变
- GREEN：`cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/test/stop-handoff-smoke.mjs green`
  - 断言：hints 正确输出，且缺 validation.md / stale validation 的退出语义仍成立

### 5. 定向验证
- `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs doctor`
- `cd /home/wula/IdeaProjects/sdd && node harness/plugin/runtime/cli.mjs verify`
- `cd /home/wula/IdeaProjects/sdd && bash hooks/full-verify.sh`

## Rollout and Rollback

- rollout：先新增静态进度面与 status summary，再让 hooks 与 contract checks 引用新的摘要逻辑
- rollback：若 `status` 或 hook 摘要引入噪音或误导，可回退到原先最小启动检查与 stop gate 行为，同时保留 `PROGRESS.md` / spec 文档化成果

## Risks

- `PROGRESS.md` 若写得过细，后续容易过期
- Node hook 与 legacy shell hook 可能继续漂移
- 若 stop 文案写得过头，容易被误解成“已自动写 memory”
- 若 `status` 输出没有稳定契约，后续 smoke 仍会退化成 grep-only

## Open Questions

暂无会改变当前路径的关键开放问题。后续若要实现 `PROGRESS.md` 的自动更新机制，应单独立新 change，而不是在本轮扩大 scope。

## Design Self-Review

- requirement coverage：已覆盖 progress surface、startup summary、stop handoff 三个目标
- scope：限定在 repo contract 与 runtime lifecycle，不扩展到业务 API / data
- testability：为 `status`、SessionStart、contract 校验、Stop 分别定义了可执行 smoke
- overclaim 防护：已明确拒绝“自动 memory write”表述
- truth priority：已固定静态快照与动态真相的优先级

## Approval

- requirement reviewer：pass（2026-07-15）
- design reviewer：pass（2026-07-15）
- plan critic：pass（2026-07-15，针对正式 plan 可执行性）

当前 design 已完成 approval，可把 state 从 `SPECIFIED` 推进到 `DESIGN_APPROVED`，并在正式 `# Tasks` 落盘后进入 `TASKED`。
