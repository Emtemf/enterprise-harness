# Design

## Requirement Alignment

本 change 的目标不是复制 pi 的命令面，而是借鉴它在 repo-facing contract、release smoke 与 containerization 文档上的设计方法，并把其中适合 Enterprise Harness 的部分转成当前仓库可落盘的增量。

本轮至少完成三件事：

1. 把 pi-inspired 改进项登记成 GitHub issues
2. 明确第一批低风险实现范围
3. 实现一个最值得优先落地的 repo-facing 改进

## Current-State Evidence

从 pi 的公开仓库读取到的关键信号：

- 顶层 `AGENTS.md` 用于定义 repo-specific human/agent contract
- 根 `package.json` 暴露了较清晰的 release / check / release:local 入口
- containerization 文档把 host / sandbox / tool routing 的边界讲清楚

与当前 Enterprise Harness 对比：

- 我们已有 `CLAUDE.md` 与 `.claude/rules/`，但缺一个 repo-facing 的 `AGENTS.md`
- 我们已有 `prepublish-check`，但 source-external release smoke 还只是 issue 级想法
- 我们已有 local runtime adapter 思路，但 containerization/sandboxing 还没有稳定文档入口

## Options Considered

### Option A：一次性同时实现 AGENTS / release:local / containerization docs

### Option B：先登记全部优化点，再实现一个低风险、高价值的切片

## Selected Option and Rationale

选择 **Option B**。

理由：

- 用户明确要求“登记 issue，并解决这些 issue”中的至少一个高价值、低风险优化点
- `AGENTS.md` 是 repo-facing contract 补齐，价值高、风险低、不会立即牵动 runtime 行为
- `release:local` 与 containerization 文档都值得做，但更适合后续单独 change / issue 推进

## Rejected Options

拒绝“一次性全做完”，因为会把 repo contract、release flow、runtime isolation 三类变化混在同一 change 中，降低验证与归因清晰度。

## Affected Layers

- repo-facing contract：`AGENTS.md`
- documentation surface：`README.md`、`CONTRIBUTING.md`
- runtime verification surface：`doctor.mjs` / `lib/checks.mjs`
- stable specs：`directory-model.md`

## Cross-layer Type and Mapper Matrix

本 change 不涉及 Java 类型映射或 API 数据结构。

| Layer | Responsibility |
|---|---|
| `AGENTS.md` | 面向人类与 agent 的仓库协作前门 |
| `CLAUDE.md` | Claude Code runtime-facing 高层合同 |
| `.claude/rules/` | Claude Code 自动加载规则 |
| `doctor/checks` | required project file 验证 |

## Repository Port Design

不适用。

## API Contract

不适用。

## Data Design

不涉及业务数据；会改变 repo contract 必需文件集合。

## Error Handling

如果后续仓库缺失 `AGENTS.md`：

- `doctor` 应报告 required project file 缺失
- 结构校验应将其视为 contract 缺口

## Transaction Boundaries

不适用。

## Testing Strategy

本轮至少验证：

1. `AGENTS.md` 已创建并内容与当前入口模型一致
2. `doctor` 将 `AGENTS.md` 视为 required project file
3. `verify` 在引入该 contract 文件后仍通过

## Rollout and Rollback

- rollout：先在 repo contract 层引入 `AGENTS.md`，并同步 README / CONTRIBUTING / directory model / doctor/checks
- rollback：若该入口造成混淆，可回退 required-file 约束，但保留外部 issue 追踪与 comparison evidence

## Risks

- 若 `AGENTS.md` 与 `CLAUDE.md` 职责边界写不清，反而会增加协作歧义
- 若把 `AGENTS.md` 误写成 Claude 自动加载规则，会和 `.claude/` 运行时源冲突

## Open Questions

1. 后续是否需要 package/runtime 级别的更细 `AGENTS.md` 扩展？
2. `release:local` 是否最终进入 package scripts，还是先停留在 spec / issue？
3. containerization 指南是放到 `harness/specs/` 还是 runtime docs 更合适？

## Design Self-Review

- requirement coverage：已覆盖 issue 登记 + 第一批实现切片
- scope control：只实现 `AGENTS.md` 相关低风险增量
- testability：可通过 doctor/checks/verify 直接验证
- fallback awareness：明确外部参考只作方法借鉴，不直接同步命令面

## Approval

当前设计作为 pi-inspired 第一批实现的最小设计入口已具备，可进入 tasking 与实现阶段。
