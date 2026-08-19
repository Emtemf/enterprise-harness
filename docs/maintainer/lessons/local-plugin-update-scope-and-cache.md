---
id: local-plugin-update-scope-and-cache
severity: high
tags: [plugin, update, scope, cache, hooks]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# 本地安装的插件更新：带正确 scope，并在 reload 后清理旧缓存

## 症状

- `claude plugin update <id>` 报 `Plugin "<id>" is not installed at scope user`，
  更新不生效，版本一直停在旧号（issue #35 的根源）。
- 更新后仍报旧版本才有的 hook 错误（如 `Stop hook error: JSON validation failed`、
  `references ${CLAUDE_PLUGIN_ROOT} but the hook is not associated with a plugin`），
  即使源码早已修复。

## 根因

1. **scope 不匹配**：`plugin update` 默认查 **user** scope，但本地开发/迭代多是
   **local** scope 安装，不带 `--scope local` 就找不到、不更新。
2. **活动会话与缓存生命周期错位**：`~/.claude/plugins/cache/<mkt>/<plugin>/<version>/`
   下每个版本一个目录。Claude Code 会话可能仍持有更新前的 `CLAUDE_PLUGIN_ROOT`；若更新脚本立即删除该目录，后续 hook 会以 `MODULE_NOT_FOUND` 失败。保留目录只能避免 loader 崩溃，不能让活动会话自动切换到新版本。

## 规避

- 本地更新必须使用实际安装 scope：先从 `claude plugin list --json` 读取，再执行
  `claude plugin update <id> --scope <实际 scope>`。
- 用封装命令执行更新：`node runtime/cli.mjs update-local`。默认保留非当前版本缓存，
  避免仍在运行的 hook 路径失效；`--dry-run` 只预览。
- 更新后执行 `/reload-plugins`；若仍引用旧版本，完全退出并启动全新 Claude Code 会话。
- 确认新会话已经使用当前插件后，再运行
  `node runtime/cli.mjs update-local --prune-old` 显式清理旧缓存。
- 更新后的 `plugin list --json` 无法复核时必须 fail closed 并保留全部缓存，不能猜测当前 `installPath`。

## 关联

- `runtime/update-local.mjs` + `lib/plugin-cache.mjs`
- 相关 hook 坑见 [[stop-hook-stdout-json]]、[[hook-var-scope-settings-vs-plugin]]
