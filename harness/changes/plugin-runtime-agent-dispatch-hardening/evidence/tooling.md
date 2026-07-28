# Tooling Evidence

## codegraph

- Status: available / index up to date
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `codegraph status`
  - `query/callers/impact recommendExplorationLane`
  - `query/impact buildWorkflowResult`
  - `query loadActiveChange`
  - `query isGovernedTarget`
  - `query validateCompletionReviewers`
  - `query cmdArchive`
- Key Findings:
  - workflow primitives 只返回 logical lane 与 next action，不执行 Agent。
  - gates/checks 是 pre-write、verify、stop、archive 的共享承重点。
  - CodeGraph affected 未完整发现 Markdown smoke 依赖，测试矩阵必须显式维护。
- Fallback Reason: Markdown/frontmatter 精确 dispatch 文案不属于 CodeGraph 主要语义索引，
  因此对 `.claude/**/*.md`、plugin manifests 与 smoke tokens 使用 `rg`/Read 补充；可信度高。

## Context7

- Status: not-applicable
- Library Name: Claude Code
- Resolved Library ID: N/A
- Version: 2.1.220
- Query: plugin skills/subagents/hooks runtime contract
- Key Findings: 当前事实应以 Claude Code 官方文档与本机 CLI/live probe 为权威来源。
- Fallback Reason: Claude Code 宿主规范不是通过 Context7 wrapper 查询的第三方库行为。

## Vendor / Official Docs

- Source:
  - `https://code.claude.com/docs/en/plugins`
  - `https://code.claude.com/docs/en/slash-commands`
  - `https://code.claude.com/docs/en/sub-agents`
  - `https://code.claude.com/docs/en/hooks`
- Version / Snapshot: 2026-07-28 / Claude Code 2.1.220
- Query: plugin namespace、skill/command precedence、agent isolation、agent identity hook fields
- Key Findings:
  - plugin skill/agent 有 scoped canonical name；standalone 与 plugin 入口不可混称。
  - 同名 command 会遮蔽真实 orchestrator skill。
  - subagent 支持 `isolation: worktree`，本 change 不替换 Claude 默认 worktree creator。
  - 通用 hook 的 `agent_id` 只在 subagent 内出现；plugin `SubagentStart/Stop.agent_type`
    是 scoped identifier，必须用 receipt 关联。
  - `SubagentStart` 不可阻断；`SubagentStop` 可 block malformed packet。

## 官方文档复核（2026-07-28）

- Plugins 文档明确 standalone skill 是 `/hello`，plugin skill 始终为
  `/plugin-name:hello`，并建议新插件使用 `skills/`。
- Subagents 文档明确 plugin agent 以 scoped name 出现在 typeahead；`isolation: worktree`
  让 Bash/PowerShell 在隔离工作树执行。
- Hooks 文档明确：
  - common `agent_id` 只在 hook 发生于 subagent 调用内部时出现；
  - plugin `SubagentStart/Stop.agent_type` 是 scoped identifier；
  - `SubagentStop` 提供 `agent_transcript_path`、`last_assistant_message` 与 block 控制；
  - 自定义 `WorktreeCreate` 会替换 Claude 默认 git 行为，因此本 change 不注册该 hook。
