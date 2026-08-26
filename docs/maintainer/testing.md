# 测试

Clarify behavioral eval 定义位于 `test/skill-evals/harness/evals.json`。静态测试不会声称这些模型行为已执行；
用 `node test/skill-evals/harness/run.mjs --case <id> --model sonnet --reps 5 --timeout-ms 120000 --dry-run`
检查 exact argv，再移除 `--dry-run`。Runner 分别采集 no-guidance control 与 with-skill，每组至少 5 次 fresh
无 session 进程；逐次进度、timeout/exit 和原始输出写到被忽略的 `test/skill-evals/harness/results/`，scoring
manifest 把每份输出绑定 assertions/forbidden。进程成功不代表行为通过，必须人工核读并填写 verdict。
timeout 可由平台记录为 `exitCode=null + signal`，也可由进程处理 `SIGTERM` 后记录为
`exitCode=143 + signal=null`；两者都必须同时带 `processStatus=timeout` 与 `timedOut=true`，且 verdict 只能是 fail。
Control 固定使用 `--safe-mode --disable-slash-commands --setting-sources ""`；with-skill 使用
`--setting-sources "" --plugin-dir <checkout>` 且只允许该一个 plugin-dir。两组 cwd 都是 checkout 外的临时目录，
采集后保留实际隔离 workspace 直到 manual review；review 验证 ownership marker 与每次 cwd 后再事务化清理，manifest 保留 isolation argv、临时 cwd、review-bound cleanup 状态与 receipt。

人工核读完成后，用 `--record-review <scoring-manifest.json> --review-file <review.json>` 附加 immutable review。
记录前 runner 会从当前 eval case 重算每个 run 的 variant、repetition、command、完整 argv、isolation argv、
`shell:false`、timeout 与 cwdRef，并核对 stdout/stderr digest、collection completeness 和严格 calendar-valid
RFC3339 时间；manifest 字段不能自证 provenance。Claude 使用官方 `stream-json --verbose` 输出，并以
`--max-turns 4` 将本 eval 的 snapshot Read、phase-reference Read 与 final action 约束成有限回合；runner 单独保存
原始 trace，重算最终文本和 tool-use projection，并在 review 时同时核对三者。非 completed run 可保留最后一个被
signal 或 buffer 截断的 JSON fragment，completed run 或中间坏行仍 fail closed。任一 timeout、nonzero 或
mechanical-shape failure 不能评为 pass。
Review 写入成功仍只代表该 collection 的人工 verdict，不会自动把 skill candidate promotion 为 best。

带 `toolProfile: read-only` 的 held-out reference-routing cases 会把 `--tools Read` 同等应用于 control/treatment，
并在每次 owned workspace 写入 digest-bound `controller-snapshot.json`。模型必须先 Read 该 runtime-snapshot fixture，
不能从 eval prompt 推断状态；随后对 research、decisions 或 completion reference 的实际读取也必须由 trace 中的
Read tool-use 证明，模型自述或引用独有内容不能替代。No-tools terminal case 与这些
tool-enabled routing cases 分开评分，不能把 Plan mode 无法持久化 packet 当成模型失败，也不能用静态 path 检查
替代 tool trace/manual review。

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
