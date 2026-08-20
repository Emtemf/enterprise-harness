---
name: implement
description: >
  Execute a frozen task in an isolated worktree with strategy-matched
  real execution receipts. Use after plan is approved.
user-invocable: false
context: fork
agent: enterprise-harness:implementer
background: false
---

# Implement

本 Skill 是 Implement 阶段单个冻结 task 的执行合同。`implementer` 是唯一可修改产品代码的
capability；它在需要修改代码时使用原生隔离 worktree。它只消费 task 的 digest-bound handoff，
不扩展范围、不审批自己、不代替 Main 做业务决定。

## Supporting files

- [finalize-result.mjs](scripts/finalize-result.mjs) — 校验 task receipt 完整性、生成 StageResult

## 开始前

1. 验证 `input.json` 的 change、task、设计/task digest、exact argv、worktree 与目标路径。
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

受治理路径只能由该 runner 内部解析并启动的 frozen argv 子进程修改；implementer 不得使用
`Write`、`Edit`、`NotebookEdit` 或任意其他 Bash 命令直接修改 `src/main/java/**`、
`src/test/java/**`、`openapi/**`。launcher 不接受外部 child argv、重定向、管道或命令串联，
防止把 shell 文本伪装成 frozen command。

`task-run` 只接受当前 `implement` task、fresh Handoff v2 input 和绑定到同一 run 的
`enterprise-harness:implementer`。它先把增量收据写入 git common-dir spool；完整 phase chain
通过后，以 exclusive write 发布 canonical `runtime-runner` receipt。旧 `tdd-run` / `tdd-executor`
只属于 v5 compatibility，不得作为 v6 完成证据。

每个 command 必须与冻结 argv 完全一致；exit status、stdout/stderr digest、时间、worktree/tree
snapshot 和 changed paths 进入 machine-generated receipt。失败、skip、unsupported 不能被改写为
pass。

## 质量闭环

1. 以最小改动实现 task，运行 task 定义的验证。
2. 对 task scope、changed paths、receipt 完整性、设计 trace、风险/rollback 和验证结果执行自检。
3. 写入 `harness/changes/<changeId>/evidence/tasks/<taskId>.json` 的 machine-generated receipt，随后运行
   `node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <task-id> <run-id>`，脚本只读取该 task 的 canonical runtime receipt；再用
   `node "${CLAUDE_PLUGIN_ROOT}/runtime/handoff.mjs" persist <change-id> <run-id> <result-path>`
   持久化 StageResult；assertions 与 `selfCheck` 必须绑定 receipt、产物和输入 digest。
4. Main 必须再创建不同 run 的 `review` check。worktree 只隔离文件，不建立 reviewer 独立性；
   只有独立 `ReviewResult` 和 runtime CompletionProof 才能完成 task/stage。

## 禁止事项

- 非 TDD task 不得编造 RED evidence；TDD task 也不得跳过真实 RED。
- 不修改未冻结的路径、安装任意新依赖、重写历史 evidence 或把 receipt 写成手工总结。
- 不在此 forked Skill 中向用户提问；把明确的 `NEEDS_DECISION` 返回给 Main。
