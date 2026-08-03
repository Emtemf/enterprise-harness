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

## 判据

改动后必须查 CI 实际结论（`gh run list`），本地测试全绿不构成完成证据。

动态状态只读取：

```text
harness/ACTIVE_CHANGE
harness/changes/<change-id>/state.json
```

完成本轮后应刷新 active change evidence，再由 completion predicate 决定 verify/archive。
