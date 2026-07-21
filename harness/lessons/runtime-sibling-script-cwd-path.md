---
id: runtime-sibling-script-cwd-path
severity: high
tags: [runtime, cwd, spawn, plugin]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# runtime 脚本用 cwd 相对路径 spawn 兄弟脚本，装进目标项目就崩

## 症状

`workflow run` / `start-change` 等命令在仓库根能跑，但在企业目标项目里
（安装插件后）报 `MODULE_NOT_FOUND`，找不到 `start-change.mjs` /
`lifecycle.mjs` 等兄弟脚本。

## 根因

runtime 脚本用 `process.cwd()`（或写死 `'harness/plugin/runtime/xxx.mjs'`）
来定位并 spawn 兄弟脚本。企业目标项目里 cwd 是用户项目根，插件真实物理
位置却在 `${CLAUDE_PLUGIN_ROOT}` 缓存目录下，两者不一致。

同类历史坑：`cli.mjs` 也曾用 `import.meta.url` 反向解析 repoRoot 又误把
兄弟脚本定位也绑到 cwd。

## 规避

- **兄弟 runtime 脚本**必须相对**自身目录**定位：
  `const runtimeDir = path.dirname(fileURLToPath(import.meta.url))`
  然后 `spawnSync('node', [path.join(runtimeDir, 'sibling.mjs'), ...])`。
- **数据目录**（harness/changes 等）才用 `process.cwd()` / `projectRoot()`，
  因为那要对准用户当前项目。
- 两者职责不同，不能混用同一个 root。

## 关联

- `harness/plugin/runtime/cli.mjs`、`workflow.mjs`、`start-change.mjs` 已按此修正
- maintainer-only 命令（install/migrate/update/prepublish/release-local）
  仍用 cwd 相对，但它们只在仓库根手动运行，暂不受影响——若未来要在目标项目
  运行，需同样处理
