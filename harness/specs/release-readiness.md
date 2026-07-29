# 发布准备与验收

## 当前发布投影

以下版本必须完全一致：`package.json`、`harness/plugin/manifest.json`、`.claude-plugin/plugin.json`、marketplace root、marketplace plugin entry，以及 README 标题。当前版本为 `0.2.29`。

## 阻断式 prepublish

任何版本文件写入、release commit、tag、package、push 前必须先运行：

```bash
npm run prepublish-check
```

它至少消费 Task 1–3 P0 aggregate、release/version acceptance、runtime doctor/sync/verify/upstream-check，以及 `claude plugin validate .` 零 warning。platform 与 release workflow 都必须把它作为 blocking step。

## Live E2E

确定性 CI 不依赖账户凭据。已认证本机通过以下显式开关执行 clean-target plugin-only E2E：

```bash
HARNESS_LIVE_E2E=1 node harness/plugin/runtime/test/claude-plugin-live-e2e.mjs verify
```

未设置开关只能明确输出 SKIP，不能写 pass evidence；设置后 Claude 缺失、认证/容量失败、canonical skill、portable PATH、scoped Agent 或 ledger binding 任一失败都必须非零退出。

## 发布边界

本规范只定义验收，不授权自动 push、tag 或创建 GitHub Release。维护者必须单独明确执行发布动作。
