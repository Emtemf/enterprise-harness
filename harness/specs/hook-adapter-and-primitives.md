# Hook Adapter and Workflow Primitives

## 目标

澄清此前常被笼统称为 “runtime” 的那一层，在 Claude Code-only phase 1 中应如何理解。

本项目当前不再把这层理解为“第二个编排器”，而是拆分成两部分：

1. **Hook Adapter Layer（接缝层）**
2. **Workflow Primitives Layer（统一业务原语层）**

## 一句话原则

- 编排权在 `/harness` 与阶段 skills
- 执行权在专职 agents
- Hook Adapter Layer 只负责 Claude Code 生命周期接入与机械阻断
- Workflow Primitives Layer 只负责稳定状态推断、状态变更、恢复入口与 evidence/verdict 消费

## 1. Hook Adapter Layer

### 定义
这一层是 Claude Code 宿主生命周期与本仓库治理逻辑之间的接缝层。

### 典型载体
- `session-start.mjs`
- `pre-explore.mjs`
- `pre-write.mjs`
- `post-write.mjs`
- `stop.mjs`
- `cli.mjs` 背后直接调用的确定性 backend actions

### 职责
- 接收 Claude Code 生命周期事件
- 调用业务原语
- 做不可绕过的阻断
- 输出当前阶段、当前 gap、恢复入口
- 承担 deterministic backend action 的外层调用壳

### 不负责
- 不定义完整 staged workflow 语义
- 不替代 `/harness` 决定整体编排
- 不在多个 hook 文件中各写一套流程解释

## 2. Workflow Primitives Layer

### 定义
统一业务原语层是阶段推断、恢复入口、gap 判断、review/validation 消费与 durable state 辅助动作的稳定底层。

### 典型原语
- `inferWorkflowStage()`
- `recommendNextEntry()`
- `recommendExplorationLane()`
- `inferCurrentGap()`
- `computeGuideReminder()`
- `buildStatusSummary()`
- `validateCompletionReviewers()`
- `loadActiveChange()`
- `renderTECPCCard()`

### 职责
- 提供可复用、可测试的稳定原语
- 避免 skill / agent / hook 各自复制推断逻辑
- 让恢复入口、当前 gap、完成态消费有唯一实现来源

### 不负责
- 不作为用户前门
- 不直接承担长篇架构叙事
- 不单独决定高层产品交互

## 为什么这不是“fat runtime”

fat runtime 的风险是：
- 自己决定阶段
- 自己路由用户
- 自己描述完整流程
- 与 skill / docs 并行定义 contract

当前 phase 1 的目标不是保留这种 fat runtime，而是：
- 保留 Hook Adapter Layer
- 保留 Workflow Primitives Layer
- 把编排权收回 Claude Code 原生层

## 与 skill / agent 的关系

### skill
- 定义阶段方法论
- 消费原语的结论
- 不复制原语逻辑

### agent
- 执行窄任务
- 返回结构化结果
- 必要时依赖 skill 所代表的阶段 contract
- 不复制原语逻辑

### hook
- 在生命周期事件中调用原语
- 做硬阻断
- 不复制 skill 的长篇阶段话术

## 当前目标

这份文档的作用，是为后续 phase 1 重构立一个明确边界：

> 我们不是“保留 runtime 编排器”，
> 而是“保留 hook 接缝层与统一业务原语层”。
