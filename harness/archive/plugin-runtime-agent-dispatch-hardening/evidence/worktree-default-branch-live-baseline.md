# Claude worktree default-branch live baseline

Date: 2026-07-28

## Purpose

验证 Claude Code `tdd-executor` 的 `isolation: worktree` 是否从当前 parent session `HEAD`
创建隔离工作树。

## Probe

- Claude Code: `2.1.220`
- plugin load: `claude --plugin-dir <control-checkout> --setting-sources user`
- requested subtype: `enterprise-harness:tdd-executor`
- parent/control HEAD:
  `fad5224de455d4ae2e33e3fe63e9bf24bde9db06`
- observed agent id: `a0426fb8a050ce9ea`
- auto-created worktree:
  `/home/wula/IdeaProjects/sdd/.claude/worktrees/agent-a0426fb8a050ce9ea`
- initial worktree HEAD:
  `ef4406821a626f22b9880ac4e63eb6bba8abcc3d`
- `origin/main`:
  `ef4406821a626f22b9880ac4e63eb6bba8abcc3d`

初始 worktree 中不存在：

- `harness/changes/plugin-runtime-agent-dispatch-hardening/tasks.md`
- Task 1 新增的正式 `harness/plugin/runtime/tdd-run.mjs`

executor 随后尝试自行创建 branch 并 checkout 到 control branch；该行为依赖模型纠偏，
不能作为企业级确定性基线。主 orchestrator 因此终止本次 probe，未接受任何实现或 receipt。

## Official contract confirmation

Claude Code subagent 文档明确说明 `isolation: worktree` 默认从 default branch，而不是
parent session `HEAD` 分支。Hooks 文档说明 `WorktreeCreate` 会替换默认 git 行为，输入包含
`cwd` 与 slug `name`，command hook 成功时必须把 worktree 路径作为 stdout 最后一个非空行。

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks

## Design consequence

Task 2 必须注册 fail-closed 的 `WorktreeCreate` hook，从事件 cwd 的已提交 `HEAD` 创建仓库内
隔离 worktree，并在返回路径前复核新 worktree HEAD。不得依赖 default branch，也不得要求
executor 启动后自行 checkout 纠偏。
