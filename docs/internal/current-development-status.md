# 当前研发快照

更新时间：2026-07-29

本文件仅供维护者继续开发，不是产品合同、安装资产或动态状态真相。

- active change：`plugin-runtime-agent-dispatch-hardening`
- tier：L3
- 目标：统一隔离 executor/checker、TECPC handoff、agent-aware hooks、澄清评分与可诊断错误码
- 主干配置包含 Linux/macOS/Windows 与 Node 20/22 matrix；实时结果只以 GitHub Actions 为准
- 当前审计改造：实现与文档已完成本地验收，待提交主干并发布新版本

动态状态只读取：

```text
harness/ACTIVE_CHANGE
harness/changes/<change-id>/state.json
```

完成本轮后应刷新 active change evidence，再由 completion predicate 决定 verify/archive。
