# AGENTS

## 目标

为当前仓库提供一个**面向人类与各类 agent 的仓库级协作合同**。

这个文件不是 Claude Code 的自动加载规则源；它的职责是给外部贡献者、其他 agent harness、以及首次进入仓库的人一个稳定前门。

## 先读什么

建议阅读顺序：

1. `README.md`：项目定位、入口模型、Quickstart
2. `AGENTS.md`：仓库级协作合同
3. `CLAUDE.md`：Claude Code 专用高层操作合同
4. `harness/specs/`：长期稳定规范
5. `CONTRIBUTING.md`：贡献与提交约定

## 入口模型

### 1. Claude Code 会话入口
优先从：

- `/harness`

开始。它负责：

- 接住新需求
- 继续当前 change
- 判断下一步进入 intake / design / validation / release 的哪一段

### 2. Runtime / 仓库命令入口
优先使用：

- `node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`
- `node harness/plugin/runtime/cli.mjs bootstrap`
- `node harness/plugin/runtime/cli.mjs doctor`
- `node harness/plugin/runtime/cli.mjs sync`
- `node harness/plugin/runtime/cli.mjs verify`

### 3. 自动门禁层
自动发生但不是总入口：

- `CLAUDE.md`
- `.claude/rules/`
- `.claude/settings.json` hooks

这些负责：

- 默认流程约束
- 写前/写后 gate
- stop validation 检查

## 工作流

对 L1 及以上变更，默认按以下顺序推进：

```text
intake
→ discovery
→ route
→ design
→ plan
→ TDD
→ review
→ validation
→ archive
```

## 仓库约定

### 规则源
- `.claude/rules/` 是 Claude Code 的自动加载规则源
- 根目录 `rules/` 与 `agents/` 视为历史参考，不再是运行时真相

### 资产落点
- 长期规范：`harness/specs/`
- 活动 change：`harness/changes/<change-id>/`
- 探索证据：`harness/explorations/` 或 change `evidence/`
- 模板：`harness/templates/`

### 证据要求
聊天记录可以作为证据来源，但不能替代正式证据资产。

最终应整理并落盘到：

- `validation.md`
- `evidence/*.md`
- `reviews/*.json`
- `state.json`

## 关键策略

### codegraph-first
- Java / 后端分析默认先走 codegraph
- 只有在不可用、结果不足、或影响面无法覆盖时才 fallback

### Context7-first
- 涉及外部库、框架、SDK、版本行为时优先 Context7
- 不足时再查官方文档或官方源码

## 贡献边界

- 不要把聊天上下文当成唯一状态来源
- 不要在 codegraph 可用时直接跳过到 grep
- 不要在 design / RED / validation 缺失时声称完成
- 不要把 hooks 当成总编排器
- 不要把 command 当成需求分析器

## 受治理路径

当前 `reference-service/` 受更严格 gate 保护。

当修改以下路径时：

- `reference-service/src/main`
- `reference-service/src/test`
- `reference-service/openapi`

应确保：

- `harness/ACTIVE_CHANGE` 有效
- 相应 design / RED gate 已满足

## 结论

一句话总结：

> `AGENTS.md` 负责给仓库一个面向人类与 agent 的协作前门；`CLAUDE.md` 与 `.claude/` 继续负责 Claude Code 的运行时专用约束。
