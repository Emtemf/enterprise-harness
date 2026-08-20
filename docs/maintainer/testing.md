# 测试

分层：

- unit：纯函数、schema、路径、parser、状态迁移
- integration：CLI、hook stdin、文件系统、安装、打包、handoff、receipt
- adversarial：逃逸、symlink、伪造、重放、并发、脏工作区
- contract：plugin manifest、生成投影、稳定错误码
- external-project：干净 Maven/Spring fixture 完整生命周期

P0：

```bash
node runtime/test/task1-authoritative-evidence-smoke.mjs verify
node runtime/test/task2-plugin-agent-smoke.mjs verify
node runtime/test/task3-gate-completion-smoke.mjs verify
node runtime/test/task4-release-acceptance-smoke.mjs verify
```

发布前或改动跨越 runtime 与 fixture 时，用聚合入口一次跑完四条流水线：

```bash
npm run test:everything
```

分别运行时注意 `test:all` 只含 smoke suite，不含 external-project E2E：

```bash
npm run test:all
npm run prepublish-check
```

真实外部 Maven/Spring fixture：

```bash
npm run test:e2e
```

RED 必须来自目标断言在缺少实现时失败；同一测试在实现后通过。源码 token 检查只能用于 manifest/path parity。

流水线以 Harness 设计风险为准：

```bash
npm run test:skills    # Skill packaging、方法内容、行为场景和 wiring
npm run test:platform  # 路径、进程、launcher、worktree、lock 等跨平台合同
npm run prepublish-check # 完整 deterministic + release-surface 合同
```

`core-quality` 在 Linux/Node 22 上完整跑一次；`skill-quality` 单独守住 Claude Code Skill 合同；
`platform-smoke` 只把平台敏感 profile 放入 Linux/macOS/Windows 与 Node 20/22 的代表性组合。
不要把全量 suite 乘以整个平台矩阵。确定性 gate 不执行 Context7 在线探测。

远程 marketplace 安装/更新由 `plugin-install-flow-smoke.mjs` 单独执行，不进入离线 prepublish；本地 marketplace 安装与插件结构校验仍属于确定性 gate。
