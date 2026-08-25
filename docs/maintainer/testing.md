# 测试

Clarify behavioral eval 定义位于 `test/skill-evals/harness/evals.json`。静态测试不会声称这些模型行为已执行；
用 `node test/skill-evals/harness/run.mjs --case <id> --model sonnet --reps 5 --timeout-ms 120000 --dry-run`
检查 exact argv，再移除 `--dry-run`。Runner 分别采集 no-guidance control 与 with-skill，每组至少 5 次 fresh
无 session 进程；逐次进度、timeout/exit 和原始输出写到被忽略的 `test/skill-evals/harness/results/`，scoring
manifest 把每份输出绑定 assertions/forbidden。进程成功不代表行为通过，必须人工核读并填写 verdict。

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

发布前或改动跨越 runtime 与 fixture 时，用本地权威入口跑完 prepublish、external-project E2E、制品、SBOM、release notes 与解包验收：

```bash
npm run quality:local
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

GitHub-hosted 平台 matrix 包含 Linux、macOS、Windows 与 Node 20/22，但只允许 `workflow_dispatch` 手动触发。日常 push、tag 和发布不自动使用 Actions 分钟。确定性 gate 不执行 Context7 在线探测。

手动 Security workflow 只保留 OSSF Scorecard。PR 自动触发已移除，因此 GitHub dependency-review 也明确停用；当前包没有 npm dependencies。未来引入依赖时，必须先把锁定依赖审计加入 `quality:local`，不能依赖已停用的 PR job。

远程 marketplace 安装/更新由 `plugin-install-flow-smoke.mjs` 单独执行，不进入离线 prepublish；本地 marketplace 安装与插件结构校验仍属于确定性 gate。
