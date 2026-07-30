# Hooks

权威清单是 `harness/plugin/hooks-manifest.json`：

```bash
node bin/generate-hooks.mjs
node bin/generate-hooks.mjs --check
```

生成目标：

- `hooks/hooks.json`：plugin，使用 `CLAUDE_PLUGIN_ROOT`
- `.claude/settings.json`：standalone，使用 `CLAUDE_PROJECT_DIR`

每项声明 event、matcher、script、timeout、performanceBudgetMs、failMode 和 statusMessage。

预算基线：

- pre-explore `<100ms`
- pre-write `<150ms`
- post-write `<500ms`
- stop `<2s`
- full verify 独立运行

PreToolUse 只做最小快照和前置 gate。PostToolUse 只比较相同 toolUseId 的前后快照，不能把已有 dirty 文件归因给当前命令。

关键异常必须写 violation ledger，包含稳定错误码、toolUseId、agentId、target、detail 和 recovery。只有显式 fail-open 的提示型 hook 可以不中断。
