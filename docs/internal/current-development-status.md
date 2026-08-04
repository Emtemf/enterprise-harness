# 当前研发快照

更新时间：2026-08-03

本文件仅供维护者继续开发，不是产品合同、安装资产或动态状态真相。

- 当前版本：0.3.9
- active change：无（`harness/changes/` 为空，33 个已归档在 `harness/archive/`）
- 主干配置包含 Linux/macOS/Windows 与 Node 20/22 matrix；实时结果只以 GitHub Actions 为准

## 0.3.2 路径重构的遗留漂移（0.3.8 修复）

`harness/plugin/runtime/` → `runtime/`（0.3.2）声称更新了 120+ 处引用，实际漏掉四类
非 import 引用，均在 0.3.8 修复：

- `.gitignore` 仍指旧路径，导致本机运行标记 `runtime/.bootstrap-ran` 被跟踪并打进发布包
- `bin/package.mjs` 白名单未排除该标记
- `artifact-content-smoke` 中用于排除测试目录的正则仍写旧路径，断言恒真通过
- 三个 CI workflow 共 8 处脚本路径未改，CI 自 0.3.2 起连续 20 次全红

## 0.3.9 改名与守卫补齐

- `harness-intake` → `harness-clarify`：skill 名与 clarify 阶段一致，纯改名 16 处引用。
- 新增 `skill-registry-contract-smoke`：断言 name/dir 一致、无孤儿、无幽灵引用。
- `checks.mjs` 必需路径补齐 `harness-route`、`harness-stage-executor`、`harness-stage-checker`。
- `plugin-entry-agent-contract` 区分用户 skill 和 worker skill（`user-invocable: false`）。
- CI workflow 路径修复 + `ci-workflow-contract-smoke` 守卫。
- `ossf/scorecard` 改为仅公开仓库运行。

## 阶段 skill 上下文隔离

- route/design/plan/tdd/verify 加 `context: fork` + `background: false`：阶段 SOP 全文不再进主对话。此前跑完整条链会在主上下文堆叠 7 份阶段合同。
- `harness` 与 `harness-clarify` 保持 inline：forked subagent 没有用户对话通道，而 clarify 的核心行为是一次只问一个问题。
- route 原第 4 步"向用户展示并请其确认路由"移回主 orchestrator；forked route 只返回待确认项，`workflow.routeReady` 不由该 skill 置位。
- 除入口外全部 stage skill 加 `user-invocable: false`，兑现"唯一入口"。此前 `/harness-design` 等可直接跳进去绕过 gate。
- `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3` 写入 `bin/generate-hooks.mjs`（`.claude/settings.json` 是生成物，手改会被 `hook-manifest-parity-smoke` 判 stale）。

### 已知缺口

- `.claude/settings.json` 不在 `bin/package.mjs` 的 `ALLOWED_TREES` 内，安装 plugin 的用户拿不到深度 guard。深度上限时 `Agent` 被静默收走，forked 阶段会自写自审、executor/checker 塌成同一上下文，且不报错。需要 runtime 侧 fail-loud 检测（doctor 或 pre-agent hook）才能覆盖发布包用户。
- Context7 仍走 CLI（`runtime/context7.mjs` + doctor/sync/registry/launcher smoke），未改 MCP。这是刻意设计，非缺陷。

## 判据

改动后必须查 CI 实际结论（`gh run list`），本地测试全绿不构成完成证据。

动态状态只读取：

```text
harness/ACTIVE_CHANGE
harness/changes/<change-id>/state.json
```

完成本轮后应刷新 active change evidence，再由 completion predicate 决定 verify/archive。
