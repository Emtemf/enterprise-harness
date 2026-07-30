---
id: hook-changes-need-fresh-session
severity: high
tags: [hooks, session, cache, plugin, debug]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# 改了 hook 却仍报错：会话用启动时快照，且报错可能来自第三方插件

## 症状

反复看到同一个 hook 报错（如 `Stop hook error: JSON validation failed`），
即使已经修好源码、更新插件、清理缓存。报错行常带 `Ran N stop hooks`，N 大于
你自己插件声明的数量。

## 根因

1. **会话快照**：Claude Code 的 hook 配置只在**会话启动时**加载一次并固化。
   之后在磁盘上改 settings.json / 插件缓存 / stop.mjs，对**已在运行的会话无效**。
   用 `--continue` / `--resume` 恢复的会话沿用旧快照，不算"全新会话"。
2. **报错可能不是你的插件**：`Ran N stop hooks` 里的 N 是**所有已启用插件 + 各
   settings 文件**的 Stop hook 总数。第三方插件（如 oh-my-claudecode）若输出了
   Stop schema 不认的字段（`continue` / `suppressOutput`，Stop 只认
   `{decision?, reason?, systemMessage?}`），同样报 "JSON validation failed"——
   却容易被误判成自己插件的问题。

## 规避

- 改完 hook 相关内容，**彻底重开一个全新会话**（完全退出，重新 `claude`，
  不带 `--continue`/`--resume`），否则看不到效果。
- 排查 "Ran N stop hooks" 时，**穷举所有来源**再下结论：
  `~/.claude/settings.json`、`~/.claude/settings.local.json`、
  项目 `.claude/settings.json` / `settings.local.json`、`~/.claude.json`
  （含 `projects.<path>.hooks`）、以及**每个已启用插件**的 `hooks/hooks.json`。
  用 `claude plugin list --json` 看 `enabled:true` 的才真正在跑。
- 先定位是哪个脚本吐了坏输出（逐个 `echo '{}' | node <脚本>` 看 stdout 是否合法），
  别默认是自己的插件。

## 关联

- 相关 Stop hook 输出契约见 [[stop-hook-stdout-json]]、变量作用域见
  [[hook-var-scope-settings-vs-plugin]]、本地更新缓存见
  [[local-plugin-update-scope-and-cache]]
