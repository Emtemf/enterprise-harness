---
name: implement
description: >
  用于 Plan 获批后，在隔离 worktree 中按冻结策略执行任务并生成匹配策略的真实执行回执。
user-invocable: false
---

# Implement

本 Skill 是 Implement 阶段单个冻结 task 的执行合同。`implementer` 是唯一可修改产品代码的
capability；它在需要修改代码时使用原生隔离 worktree。它只消费 task 的 digest-bound handoff，
不扩展范围、不审批自己、不代替 Main 做业务决定。

## Supporting files

- [执行方法](references/method.md) — 按冻结 strategy 推进一个 task 的操作顺序与停止条件
- [产物合同](references/artifact-contract.md) — canonical receipt、StageResult 与独立 review 的职责边界
- [自检清单](references/self-check.md) — finalizer 前必须逐项核对的可观察事实
- [finalize-result.mjs](scripts/finalize-result.mjs) — 校验 canonical task receipt 并原子持久化 StageResult
- [behavioral evals](evals/evals.json) — 行为回归场景，验证 Skill 是否按意图执行

## 开始前

1. 读取 [执行方法](references/method.md)，验证 `input.json` 的 change、task、设计/task digest、
   exact argv、worktree 与目标路径。
2. 若 task 不是当前 task、输入已 stale、工作区不隔离、或需要未给定业务选择，停止并返回
   `NEEDS_DECISION` 或 block；不得修改代码后再补解释。
3. 仅可写 task 明确列出的产品路径。测试、构建输出和 evidence 的写入必须来自确定的 task 范围。

## 策略执行

执行计划指定的唯一 strategy，保存真实子进程收据，而不是声称结果：

| Strategy | Required receipt chain |
|---|---|
| `tdd` | RED → GREEN → REFACTOR |
| `regression` | REPRODUCE → VERIFY |
| `characterization` | BASELINE → VERIFY |
| `direct` | declared non-RED rationale → VERIFY |
| `migration` | DRY_RUN → APPLY → ROLLBACK |
| `generation` | GENERATE → VERIFY |

每个 phase 必须通过 v6 通用 runner 执行，不能直接运行子命令后手写收据：

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" task-run \
  <change-id> <task-id> <run-id> <phase>
```

代码变更只能使用 `Write`、`Edit` 或 `NotebookEdit`，并且必须落在当前 task 的 `writeScope.allowed`；
TDD 测试可在 RED 前写入，产品代码只有在 runner 已记录同一 run 的真实 RED 后才可修改。Bash 只允许
启动 canonical `task-run` 或 Skill 自带 finalizer，不得直接运行 Maven/Gradle/npm、修改文件、重定向、
管道或串联命令。launcher 不接受外部 child argv，防止把 shell 文本伪装成 frozen command。

`task-run` 只接受当前 `implement` task、fresh Handoff v2 input 和绑定到同一 run 的
`enterprise-harness:implementer`。它先把增量收据写入 git common-dir spool；完整 phase chain
通过后，以 exclusive write 发布 canonical `runtime-runner` receipt。旧 `tdd-run` / `tdd-executor`
只属于 v5 compatibility，不得作为 v6 完成证据。

每个 command 必须与冻结 argv 完全一致；exit status、stdout/stderr digest、时间、worktree/tree
snapshot 和 changed paths 进入 machine-generated receipt。失败、skip、unsupported 不能被改写为
pass。

## 质量闭环

1. 以最小改动实现 task，运行 task 定义的验证。
2. 按 [自检清单](references/self-check.md) 核对 task scope、changed paths、receipt 完整性、设计 trace、
   风险/rollback 和验证结果；不能从聊天摘要推断通过。
3. 完整 phase chain 由 runner 写入
   `harness/changes/<changeId>/evidence/tasks/<taskId>.json`。随后只运行一次独立命令：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <task-id> <run-id>
   ```

   finalizer 只消费 [产物合同](references/artifact-contract.md) 定义的 canonical receipt，重验 input digest，
   并以 exclusive write 原子持久化 StageResult。不得重定向 stdout、不得再调用第二套 persist；重复 finalization
   必须失败。
4. Main 必须再创建不同 run 的 `review` check。worktree 只隔离文件，不建立 reviewer 独立性；
   只有独立 `ReviewResult` 和 runtime CompletionProof 才能完成 task/stage。

每个 task 交接前读取共享文件
`${CLAUDE_PLUGIN_ROOT}/skills/harness/references/downstream-pitfalls.md` 的 Implement 行，并把命中项作为
self-check finding 处理；不得用 `find` 猜测 supporting file 位置。

## 禁止事项

- 非 TDD task 不得编造 RED evidence；TDD task 也不得跳过真实 RED。
- 不修改未冻结的路径、安装任意新依赖、重写历史 evidence 或把 receipt 写成手工总结。
- 不在此 forked Skill 中向用户提问；把明确的 `NEEDS_DECISION` 返回给 Main。
