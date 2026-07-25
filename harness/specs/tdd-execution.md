# TDD Execution Contract

## 目标

把 TDD 阶段从“主对话里顺手写点测试/代码”的松散行为，收敛为可机械消费的执行 contract。

本 contract 的核心要求：
- TDD 是一个**专职执行面**
- 执行默认由专职 executor agent 承担
- Java / Maven 项目必须执行真实构建命令
- 主 orchestrator 只保留阶段状态与结果摘要

## 角色划分

### `/harness-tdd` skill
负责：
- 向用户展示当前 task 的 TDD 目标
- 明确当前 RED / GREEN / REFACTOR 子状态
- 指挥是否派发 executor
- 消费 executor 返回结果

### `tdd-executor` agent（建议新增）
负责：
- 在隔离上下文/工作目录中执行 TDD
- 写测试
- 跑 RED
- 实现最小 GREEN
- 在全绿后做 REFACTOR
- 返回结构化执行摘要

### hook / primitives
负责：
- 阻止主对话直接写生产代码
- 阻止缺少 RED 证据就改受治理路径
- 记录当前 task / currentTask-scoped red verification

## 强约束

### 1. 必须使用 subagent 执行
TDD 默认由专职 executor agent 执行，不应在主对话中直接 Write/Edit 生产代码。

### 2. 必须使用 worktree
执行隔离默认要求：
- `isolation: "worktree"`

### 3. 必须执行真实构建命令
对 Java / Maven 项目，至少执行：
- `mvn test`
- `mvn verify`
- `mvn compile`

没有实际命令输出，不得声称 RED / GREEN / REFACTOR 已完成。

### 4. 主对话只保留摘要
主 orchestrator 不堆积整段构建输出，只保留：
- 当前 task-id
- 当前 tdd-status
- command executed
- command output summary
- evidence path
- 下一步决策

## 执行子状态

```text
TEST_WRITTEN
→ RED_VERIFIED
→ GREEN_VERIFIED
→ REFACTOR_VERIFIED
```

## Executor 输入 contract

至少包括：
- `change-id`
- `task-id`
- `touched-files`
- `test-first-order`
- `red-evidence-point`
- `green-evidence-point`
- `project-native-build-command`
- `scope`

若输入不足，executor 必须返回 blocker，而不是自行猜测 task scope 或命令。

## Executor 输出 contract

至少包括：
- `task-id`
- `tdd-status`
- `command-executed`
- `command-output-summary`
- `evidence-path`
- `next-step`
- `blockers`

## Double-check 入口

TDD 不是只要 executor 说“做完了”就算完成。至少需要：
- 当前 task evidence 可进入 `verify`
- validation freshness 可由 verify 阶段消费
- 主 orchestrator 将结果压缩回阶段上下文

## 禁止事项

- 不得只写测试文件而不运行构建命令
- 不得只改代码而不观察 RED
- 不得在主对话中直接承担完整 TDD 执行
- 不得把旧构建输出冒充当前证据
