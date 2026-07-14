# 企业 Harness 工作流规则

## 目标

本项目的默认目标不是“尽快写代码”，而是让较弱模型也能在仓库内按统一状态机稳定推进需求、设计、计划、TDD、验证与归档。

## 唯一自动加载规则源

本目录下的规则是 Claude Code 在本项目中的自动加载规则源。

- 项目根 `rules/` 视为历史参考，不再作为运行时唯一真相。
- 长期稳定流程说明放在 `harness/specs/`。
- 活动中变更放在 `harness/changes/`。

## 默认状态机

所有 L1 及以上代码/配置行为变化，默认按以下主状态推进：

```text
DRAFT
→ DISCOVERED
→ CHANGE_APPROVED
→ SPECIFIED
→ DESIGN_APPROVED
→ TASKED
→ EXECUTING
→ REVIEWED
→ VALIDATED
→ ARCHIVED
```

允许的异常状态：

- `BLOCKED`
- `REJECTED`

## Task 内部 TDD 状态

实现任务必须显式经过以下子状态：

```text
NOT_STARTED
→ TEST_WRITTEN
→ RED_VERIFIED
→ GREEN_VERIFIED
→ REFACTOR_VERIFIED
→ TASK_REVIEWED
→ DONE
```

## Change Tier

### L0
- 纯文档措辞、typo、无规范语义变化
- 允许定向验证完成
- 默认不要求完整 design / plan artifact

### L1
- 单模块局部行为变化
- 不影响 API / data / architecture / rule
- 必须有轻量 spec 与定向 RED → GREEN → REFACTOR 证据

### L2
- 新接口、OpenAPI 变化、持久化变化、新业务能力
- 必须经过 durable design、approval、plan、TDD、verification

### L3
- 架构边界、平台规则、跨模块/跨服务高风险变化
- 必须经过完整 L2 流程
- 需要明确 reviewer verdict
- codegraph 不可用且影响面无法确认时，默认 `BLOCKED`

## 硬门禁

- 未完成最小探索，不得宣布 final route。
- design 未批准，不得进入 plan。
- plan 未就绪，不得进入 implementation。
- 未观察到有效 RED，不得修改生产源码。
- reviewer 返回 block，不得进入下一阶段。
- validation 证据过期或缺失，不得声称完成。

## Source of Truth

- 当前变更状态：`harness/changes/<change-id>/state.json`
- 当前变更资产：`harness/changes/<change-id>/`
- 长期稳定规范：`harness/specs/`
- 快速操作合同：项目根 `CLAUDE.md`

不得用聊天上下文、个人记忆或口头描述覆盖仓库内的状态与规范文件。

## 单 writer 约束

在本仓库未进入正式 Git/worktree 管理前，默认采用 single-writer：

- 同一时刻只允许一个实现者修改业务源码
- reviewer / explorer 只读
- 不采用并行 mutating subagent

## 失败处理

当缺少工具、证据、批准或验证时：

1. 先记录 blocker
2. 明确缺了什么
3. 给出恢复所需的最小动作
4. 停止推进，而不是猜测继续
