# Claude Plugin Live Baseline

- Recorded at: 2026-07-28
- Claude Code: 2.1.220
- Mode: clean temporary target, repository loaded with `--plugin-dir`

## Probe

以不包含本仓库 `.claude/agents` 的临时目录作为 cwd，加载当前 plugin：

```bash
claude --plugin-dir /home/wula/IdeaProjects/sdd -p \
  'Invoke enterprise-harness:harness and report the first workflow action' \
  --output-format stream-json --verbose
```

并分别要求 Agent tool 使用：

```text
subagent_type=code-explore
subagent_type=enterprise-harness:code-explore
```

## Baseline observation

- `enterprise-harness:harness` 命中了 `.claude-plugin/commands/harness.md` 的安装说明，
  没有执行 `.claude/skills/harness/SKILL.md` 的“第 0 步”orchestrator。
- clean plugin-only 目标中 scoped `enterprise-harness:code-explore` 可派发。
- bare `code-explore` 只有仓库本地 `.claude/agents` 存在时才会被遮蔽式解析，不能作为
  marketplace/plugin contract。

该 baseline 只证明修复前故障。修复后必须重新运行 `claude-plugin-live-e2e.mjs`，并把
stream-json 中的 Skill/Agent 与 hook identity 摘要写入本 change validation。
