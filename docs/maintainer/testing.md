# 测试

分层：

- unit：纯函数、schema、路径、parser、状态迁移
- integration：CLI、hook stdin、文件系统、安装、打包、handoff、receipt
- adversarial：逃逸、symlink、伪造、重放、并发、脏工作区
- contract：plugin manifest、生成投影、稳定错误码
- external-project：干净 Maven/Spring fixture 完整生命周期

P0：

```bash
node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs verify
node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs verify
node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs verify
node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify
```

完整：

```bash
npm run test:all
npm run prepublish-check
```

真实外部 Maven/Spring fixture：

```bash
npm run test:e2e
```

RED 必须来自目标断言在缺少实现时失败；同一测试在实现后通过。源码 token 检查只能用于 manifest/path parity。

平台 matrix 包含 Linux、macOS、Windows 与 Node 20/22。确定性 gate 不执行 Context7 在线探测。

远程 marketplace 安装/更新由 `plugin-install-flow-smoke.mjs` 单独执行，不进入离线 prepublish；本地 marketplace 安装与插件结构校验仍属于确定性 gate。
