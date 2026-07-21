---
id: hook-var-scope-settings-vs-plugin
severity: high
tags: [hooks, settings, plugin, path]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# hook 路径变量作用域：settings.json 用 $CLAUDE_PROJECT_DIR，plugin hooks.json 用 ${CLAUDE_PLUGIN_ROOT}

## 症状

会话结束报：
`Hook command references ${CLAUDE_PLUGIN_ROOT} but the hook is not associated
with a plugin. This variable is only available in hooks defined in a plugin's
hooks/hooks.json file, not in settings.json.`
并连带 `Stop hook error: JSON validation failed`。

## 根因

`${CLAUDE_PLUGIN_ROOT}` 只在**插件的 `hooks/hooks.json`** 里有效（插件被安装时
注入）。本地开发仓库的 `.claude/settings.json` 是项目 settings，直接加载、
不属于任何插件，用 `${CLAUDE_PLUGIN_ROOT}` 无法解析 → hook 起不来 → 宿主拿不到
合法输出 → 连带 JSON validation failed。

这是一次“过度统一”造成的坑：为了让两个文件看起来一致，把 settings.json 也改成
`${CLAUDE_PLUGIN_ROOT}`，反而弄坏本地场景。两个文件加载语义不同，**不能一刀切统一**。

## 规避

- **`.claude/settings.json`**（本地项目 settings）：用 `$CLAUDE_PROJECT_DIR`——
  Claude Code 专门提供的、cwd 无关的项目根绝对路径变量。
- **`hooks/hooks.json`**（插件分发面）：用 `${CLAUDE_PLUGIN_ROOT}`。
- 两者**有意分化**，不要为“看起来一致”而统一。
- Stop hook 放行仍需 stdout 输出合法 JSON（见 [[stop-hook-stdout-json]]）。

## 关联

- `plugin-native-hooks-smoke` 已加断言：settings.json 必须用 `$CLAUDE_PROJECT_DIR`
  且不得含 `CLAUDE_PLUGIN_ROOT`；hooks.json 必须用 `${CLAUDE_PLUGIN_ROOT}`。
