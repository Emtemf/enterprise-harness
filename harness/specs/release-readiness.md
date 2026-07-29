# 发布准备与验收

## 当前发布投影

以下版本必须完全一致：`package.json`、`harness/plugin/manifest.json`、`.claude-plugin/plugin.json`、marketplace root、marketplace plugin entry，以及 README 标题。当前版本为 `0.2.29`。

## 阻断式 prepublish

任何版本文件写入、release commit、tag、package、push 前必须先运行：

```bash
npm run prepublish-check
```

它至少消费 Task 1–3 P0 aggregate、release/version acceptance、runtime doctor/sync/verify/upstream-check，以及 `claude plugin validate .` 零 warning。platform 与 release workflow 都必须把它作为 blocking step。

## 插件验收边界

发布验收只检查仓库能够提供和确定性观察的内容：

- plugin manifest / marketplace / package 投影
- `claude plugin validate .` 的静态结构检查
- clean temporary target 的安装、launcher、hooks 和资产 smoke
- handoff/agent lifecycle 的本地 fixture

不得把 Claude 账户、认证状态、订阅配额或服务容量作为插件 release gate。需要真实账户的人工试用只能作为可选观察，不得写入完成态 predicate。

## 发布边界

本规范只定义验收，不授权自动 push、tag 或创建 GitHub Release。维护者必须单独明确执行发布动作。
