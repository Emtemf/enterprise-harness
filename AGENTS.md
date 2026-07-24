# AGENTS

## 目标

为当前仓库提供一个**面向人类与各类 agent 的仓库级协作合同**。

这个文件不是 Claude Code 的自动加载规则源；它的职责是给外部贡献者、其他 agent harness、以及首次进入仓库的人一个稳定前门。

## 先读什么

建议阅读顺序：

1. `README.md`：项目定位、入口模型、Quickstart
2. `AGENTS.md`：仓库级协作合同
3. `PROGRESS.md`：当前阶段快照与继续阅读入口
4. `CLAUDE.md`：Claude Code 专用高层操作合同
5. `harness/specs/session-lifecycle.md`：会话打开/结束与 handoff 规则
6. `harness/specs/staged-workflow.md`：clarify-first staged workflow 与阶段 gate 规则
7. `harness/specs/`：长期稳定规范
7. `CONTRIBUTING.md`：贡献与提交约定

## 入口模型

### 0. Claude Code plugin / marketplace 安装入口
当前仓库已经具备本地 marketplace 可安装形态。

推荐安装路径：

- `claude plugin marketplace add /absolute/path/to/enterprise-harness`
- `claude plugin install enterprise-harness@enterprise-harness --scope local`
- 更新：
  - `claude plugin marketplace update enterprise-harness`
  - `claude plugin update enterprise-harness@enterprise-harness --scope local`

这条路径更接近 superpowers 的安装/更新体验；但对普通用户真正需要记住的工作流前门仍然只有 `/harness`。

### 1. Claude Code 会话唯一前门
优先从：

- `/harness`

开始。它负责：

- 接住新需求
- 继续当前 change
- 作为 clarify-first staged workflow 的单一入口
- 判断当前处于 `clarify / route / design / plan / tdd / verify / archive` 的哪一段
- 给出下一阶段的恢复入口或 backend 命令

### 2. Runtime / 仓库后台命令
优先使用：

- `node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`
- `node harness/plugin/runtime/cli.mjs bootstrap`
- `node harness/plugin/runtime/cli.mjs doctor`
- `node harness/plugin/runtime/cli.mjs sync`
- `node harness/plugin/runtime/cli.mjs verify`

这些命令是 `/harness` 背后的确定性 backend 动作，不是与 `/harness` 平级的第二个用户入口；普通用户按 SOP 使用时不需要先记住它们。维护者只在需要低层控制时再使用。

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
clarify
→ route
→ design
→ plan
→ tdd
→ verify
→ archive
```

说明：
- `clarify` 是强制第一阶段，优先通过代码/文档探索拿事实，再进行一问一答澄清与用户确认
- `verify` 吸收 reviewer verdict、validation freshness 与 completion evidence 的统一消费职责
- exploration 在高噪声场景下默认下沉为 read-only subagent，主 orchestrator 只消费压缩结论

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

任意项目下的以下路径都受 pre-write gate 保护（不只限于 `reference-service/`）：

- `src/main/java/**`
- `src/test/java/**`
- `openapi/**`

当修改这些路径时，应确保：

- `harness/ACTIVE_CHANGE` 有效
- 相应 design / RED gate 已满足
- `tooling.codegraph` 已有使用证据（否则被 codegraph 证据门禁 BLOCK）

## 结论

一句话总结：

> `AGENTS.md` 负责给仓库一个面向人类与 agent 的协作前门；`CLAUDE.md` 与 `.claude/` 继续负责 Claude Code 的运行时专用约束。
