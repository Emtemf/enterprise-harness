---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-04
implementationRefs:
  - agents/implementer.md
  - skills/implement/SKILL.md
  - runtime/task-run.mjs
  - runtime/lib/task-execution.mjs
  - runtime/lib/task-execution-receipt.mjs
  - runtime/lib/task-write-scope.mjs
  - runtime/lib/hooks/subagent-start.mjs
  - runtime/lib/hooks/pre-explore.mjs
  - runtime/tdd-run.mjs
  - runtime/lib/tdd-receipts.mjs
testRefs:
  - runtime/test/task-runner-v6-smoke.mjs
  - runtime/test/governed-task-run-write-gate-smoke.mjs
  - runtime/test/task-worktree-integration-smoke.mjs
  - runtime/test/installed-implement-plugin-e2e.mjs
  - runtime/test/task-execution-authority-smoke.mjs
  - runtime/test/task-write-scope-smoke.mjs
  - runtime/test/tdd-receipt-contract-smoke.mjs
---

# Implement Task 执行合同

## 目标

TDD 是 Implement task 的一种 execution strategy，不是 lifecycle stage，也不拥有独立的 v6
capability agent。v6 的所有 strategy 都由 `enterprise-harness:implementer` 在隔离 worktree 中执行，
并由同一套 machine-generated receipt 证明；worker 文本、聊天声明和手写 evidence 都不构成证据。

## v6 权威入口

Plan 必须在 schema v4 `task-commands.json` 中为每个 task 冻结唯一 `executionStrategy`、phase chain、literal
argv、输入引用和允许修改的路径；runtime 会将 child 产生的 changed paths 与 write scope 做 fail-closed 比对。
schema v3 仅作为历史读取兼容。Implement Handoff v2 必须绑定当前 task 的 `state.json` 与
`task-commands.json` digest。

每个 phase 调用：

```bash
enterprise-harness task-run \
  <change-id> <task-id> <run-id> <phase>
```

本仓库开发时的等价入口：

```bash
node runtime/cli.mjs task-run \
  <change-id> <task-id> <run-id> <phase>
```

`task-run` 在启动子进程前机械验证：

- active change、State v6、`stage=implement` 与 `currentTask`；
- fresh Handoff v2 execute input；
- Handoff agent/skill 为 `enterprise-harness:implementer` / `implement`；
- agent dispatch/start 与同一个 run、同一个 worktree 绑定；
- phase 顺序正确，并从冻结计划内部解析 child argv；launcher 拒绝外部 argv、管道、重定向和命令串联。

pre-write 对 v6 implementer fail closed：只有 active、同 session/run/worktree 绑定的 named implementer
可以用 `Write` / `Edit` / `NotebookEdit` 修改当前 task 的 `writeScope.allowed`。TDD 测试路径可在 RED 前
创建，非测试产品路径必须先存在同 run 的真实失败 RED spool。Bash 不能直接修改文件或执行构建命令，
只允许启动受信 runtime 的 canonical `task-run` launcher；runner 为冻结子进程建立短期 common-dir
authorization，成功、失败或 spawn 异常后都清理，遗留 marker 不能重放或被静默覆盖。

`enterprise-harness:implementer` 由 named Agent 启动并使用 `isolation: worktree`；其 `skills:` 在启动时
预加载完整 Implement Skill。Skill 不是直接用户入口，但必须保持 model-invocable，因为 Claude Code
不会预加载设置了 `disable-model-invocation: true` 的 Skill。SubagentStart 在任何 agent 写入前冻结
worktree status baseline；RED 前新增测试与 RED 后产品实现因此都进入同一 receipt。Claude Code 不保证
在子代理 Bash 环境导出 agent id，runner 从同 session、handoff run、worktree 的唯一 active
dispatch/start receipts 解析身份。

子命令固定使用 `spawnSync(command, args, { shell: false })`，不经过 shell 拼接。Java/Maven task
必须冻结并真实执行 `mvn test`、`mvn verify` 或项目 wrapper，不存在文字声明降级路径。

## Strategy phase chain

| Strategy | Required receipt chain |
|---|---|
| `tdd` | RED → GREEN → REFACTOR |
| `regression` | REPRODUCE → VERIFY |
| `characterization` | BASELINE → VERIFY |
| `direct` | frozen non-RED rationale → VERIFY |
| `migration` | DRY_RUN → APPLY → ROLLBACK |
| `generation` | GENERATE → VERIFY |

RED 与 REPRODUCE 必须非零；其他 phase 必须为零。失败、skip 和 unsupported 不能改写成 pass。
`direct` 的 `strategyRationale` 必须在 plan 中冻结，并与最终 receipt 完全一致。

## Canonical receipt

增量执行先写入 git common-dir：

```text
<git-common-dir>/enterprise-harness/receipts/<change-id>/tasks/<task-id>/<run-id>.json
```

完整 phase chain 通过后，runner 以 exclusive write 发布唯一 canonical artifact：

```text
harness/changes/<change-id>/evidence/tasks/<task-id>.json
```

canonical receipt 只接受：

- `provenance: runtime-runner`；
- `agent.type: enterprise-harness:implementer`；
- `executionStrategy` 与冻结 task 一致；
- Handoff input digests 完全一致且 fresh；
- worktree absolute path、git common dir、HEAD before/after、tree digest before/after；
- baseline-relative changed paths；
- 每个 phase 的 exact argv、exit code、时间和 stdout/stderr SHA-256；
- 完成时间。

canonical receipt 已存在时不得覆盖；修复失败执行必须创建新的 execute run，而不是重写历史证据。
Implement finalizer、CompletionProof 与独立 reviewer 都消费这一 canonical artifact。
finalizer 原子持久化 StageResult 后，Main 派发不同 agent/run 的 task review。reviewer 只能读取 receipt
声明的 worktree `changedPaths`，不能任意探索业务代码。review pass 后仍不能直接完成：集成 checkout
中每个 changed path 的存在状态与内容必须精确等于 reviewed worktree，runtime 才生成 TaskProof 并汇入
Implement CompletionProof。

## v5 compatibility boundary

`runtime/tdd-run.mjs`、`runtime/lib/tdd-receipts.mjs`、`evidence-import` 和
`enterprise-harness:tdd-executor` 仅用于读取或完成历史 v5 TDD 流程。它们使用独立 spool 和
`provenance: tdd-run`，不能生成或替代 v6 canonical task receipt，也不能通过 v6 completion gate。

保留 compatibility 的目的只是恢复历史 active change，不是为新 change 提供第二套执行 authority。

## 禁止事项

- 把 TDD 重新建模成 lifecycle stage；
- 在 v6 派发 `tdd-executor` 修改产品代码；
- 绕过 `task-run` 直接运行命令后手填 receipt；
- 用 `state.gates.redVerified`、agent stop event 或聊天摘要替代 receipt；
- 允许不同 run、不同 agent 或不同 worktree 续写同一 spool；
- 覆盖已发布的 canonical receipt；
- 缺独立 task review 和 CompletionProof 就进入 verify。
