---
id: local-plugin-update-scope-and-cache
severity: high
tags: [plugin, update, scope, cache, hooks]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# 本地安装的插件更新：必须带 --scope local，并清理旧版本缓存

## 症状

- `claude plugin update <id>` 报 `Plugin "<id>" is not installed at scope user`，
  更新不生效，版本一直停在旧号（issue #35 的根源）。
- 更新后仍报旧版本才有的 hook 错误（如 `Stop hook error: JSON validation failed`、
  `references ${CLAUDE_PLUGIN_ROOT} but the hook is not associated with a plugin`），
  即使源码早已修复。

## 根因

1. **scope 不匹配**：`plugin update` 默认查 **user** scope，但本地开发/迭代多是
   **local** scope 安装，不带 `--scope local` 就找不到、不更新。
2. **旧缓存残留**：`~/.claude/plugins/cache/<mkt>/<plugin>/<version>/` 下每个版本
   一个目录。旧版本目录里的旧 hook 仍会被加载并报错，直到被删除。`Ran N stop hooks`
   里的 N 就包含这些旧缓存版本。

## 规避

- 本地更新永远带 scope：`claude plugin update <id> --scope local`
  （或先 `claude plugin list --json` 读出实际 scope 再用）。
- 更新后删除非当前启用版本的缓存目录，只保留 `installPath` 指向的那个。
- 用封装命令一键完成：`node harness/plugin/runtime/cli.mjs update-local`
  （marketplace update → plugin update --scope <实际> → 清理旧缓存），`--dry-run` 预览。
- 更新后重启 Claude Code 会话才生效（hook 配置在会话启动时加载）。

## 关联

- `harness/plugin/runtime/update-local.mjs` + `lib/plugin-cache.mjs`
- 相关 hook 坑见 [[stop-hook-stdout-json]]、[[hook-var-scope-settings-vs-plugin]]
