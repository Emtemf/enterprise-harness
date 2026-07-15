# Session Lifecycle 规范

## 目标

让新的 Claude Code 会话更快从仓库恢复上下文，并让结束会话时的 handoff 落点更明确，而不是把可恢复结论只留在聊天记录里。

## 要回答的五个问题

新的会话应能尽快回答：

1. 这是什么系统
2. 怎么组织的
3. 怎么跑
4. 怎么验证
5. 现在做到哪里了

## 三层真相边界

### 1. 当前动态状态真相
以以下文件为准：

- `harness/ACTIVE_CHANGE`
- `harness/changes/*/state.json`

用于回答：

- 当前 active change 是谁
- 当前 state 是什么
- validation 是否 fresh
- blockers / approvals / currentTask 是什么

### 2. 阶段快照与阅读入口
以以下文件为准：

- `PROGRESS.md`

用于回答：

- 当前整体阶段
- 最近完成什么
- 下一步重点是什么
- 建议先读哪些文件

`PROGRESS.md` 是人工维护的静态快照，不替代动态状态真相。

### 3. 长效规则与操作合同
以以下文件为准：

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `harness/specs/`

用于回答：

- 系统是什么
- 入口模型是什么
- 怎么跑
- 怎么验证
- handoff 规则是什么

## Runtime 合同

### `status`
`status` 是新的 top-level runtime CLI 命令。

```bash
node harness/plugin/runtime/cli.mjs status
node harness/plugin/runtime/cli.mjs status --json
```

它应至少输出：

- 当前阶段
- 静态快照
- 动态真相
- 下一步阅读
- 下一步命令

JSON 模式应至少包含：

- `summaryVersion`
- `currentPhase`
- `progressSnapshot`
- `activeChange`
- `truthSources`
- `nextRead`
- `nextCommands`

### SessionStart
SessionStart 负责给新会话一个简短摘要和明确指针，不负责替代 repo 真相。

在 clarify-first staged workflow 下，SessionStart 除了当前阶段、静态快照、动态真相外，还应逐步补充：

- 当前 active change 所处的 workflow stage
- 当前 stage 是否已满足进入下一阶段的 gate
- 建议恢复入口（如 `/harness` 或后续 stage skill）

### Stop
Stop 继续承担 validation freshness / completion protection，同时补充 durable handoff guidance。

Stop 的 guidance 至少应覆盖：

- change-specific 结论优先写回当前 active change 资产
- repo-level 阶段信息写回 `PROGRESS.md`
- Claude memory 只记录 repo 中没有落盘、且通过显式动作触发的非仓库事实
- 聊天记录可以作为来源，但不能替代上述正式资产
- 如需重新确认当前状态，可运行 `node harness/plugin/runtime/cli.mjs status`

## Durable Handoff Routing

### change-specific 结论
优先写回当前 change 资产：

- `change.md`
- `design.md`
- `tasks.md`
- `validation.md`
- `evidence/*.md`
- `reviews/*.json`

### repo-level 阶段信息
写回：

- `PROGRESS.md`

### Claude memory
只保存 repo 中没有记录、但跨会话仍有价值的非仓库事实，并且必须通过显式动作触发。

### 聊天记录
聊天记录可以作为来源，但不是仓库真相，也不能替代正式资产。
