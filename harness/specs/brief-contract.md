# Brief Contract

## 目标

把“先 brief，再派 subagent，主对话只消费摘要”从 skill 文本要求，提升为可复用、可引用、可测试的系统对象。

## 适用范围

以下高噪声步骤默认应先生成 brief：
- 多模块代码探索
- 外部文档调研
- 任务级 TDD 执行
- 需要 reviewer / critic / verifier 独立复核的窄任务

## 基本原则

1. brief 必须只包含 subagent 执行当前任务所需的最小上下文
2. brief 不得等价复制整段对话或整份 design/tasks 文档
3. 主 orchestrator 负责生成/维护 brief，并在返回后只消费摘要结论
4. subagent 默认不应继承主会话全部上下文，而应以 brief 作为主要输入载体

## Brief 类型

### 1. Exploration Brief
用于 `code-explore` / `doc-research`。

最小字段：
- `question`
- `scope`
- `known-facts`
- `unknowns`
- `why-now`
- `expected-output`

### 2. Task Brief
用于 `tdd-executor` / `plan-critic` 等 task-scoped 执行或审查。

最小字段：
- `change-id`
- `task-id`
- `goal`
- `scope`
- `touched-files`
- `constraints`
- `acceptance-checks`
- `expected-output`

### 3. Verification Brief
用于 `verification-reviewer` 等完成态/验证态复核。

最小字段：
- `change-id`
- `goal`
- `scope`
- `validation-artifacts`
- `review-verdicts`
- `open-risks`
- `expected-output`

## 消费规则

- orchestrator 在派发 subagent 前应优先引用对应 brief，而不是把大段原始上下文直接粘进 prompt
- orchestrator 在 subagent 返回后只消费：facts / verdict / blockers / next-step / evidence summary
- brief 若不充分，应补 brief，而不是默认让 subagent 自行猜 scope
- phase 1 的最小动作层入口为：`node harness/plugin/runtime/cli.mjs workflow brief <change-id> <exploration|task> <name>`

## 禁止事项

- 不得把完整 requirements / design / tasks 原文不加筛选地全部塞进 brief
- 不得让 brief 退化成“复制主上下文”
- 不得在没有 brief 的情况下，把高噪声任务直接丢给 subagent
