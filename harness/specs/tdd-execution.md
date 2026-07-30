---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/plugin/runtime/tdd-run.mjs
  - harness/plugin/runtime/lib/tdd-receipts.mjs
testRefs:
  - harness/plugin/runtime/test/tdd-receipt-contract-smoke.mjs
---

# TDD Execution Contract

## 目标

TDD 是由 Claude Code 专职 subagent 执行、由 runtime receipt 证明的机械流程，不接受 worker 自报的命令字符串作为证据。

## 角色与入口

- plugin 阶段入口：`/enterprise-harness:harness-tdd`
- standalone 阶段入口：`/harness-tdd`
- plugin executor subtype：`enterprise-harness:tdd-executor`
- executor frontmatter：logical `name: tdd-executor`，并声明 `isolation: worktree`
- 主 orchestrator：只负责串行派发、集成 implementation commit、独立 review、`evidence-import` 与集成复验

主对话不得直接修改生产代码，也不得把自己的 Bash 输出包装成 executor evidence。

## worktree 基线

Claude Code 默认隔离 worktree 可能从 default branch 创建。本项目注册受控 `WorktreeCreate` hook，必须从派发 cwd 的已提交 `HEAD` 创建新 branch/worktree，并精确校验 path、完整 branch ref、registration HEAD 与 captured parent HEAD。无法证明所有权时保留资源供人工恢复，不猜测清理。

## 权威执行命令

每个 task 在 `tasks.md` 冻结 RED/GREEN/REFACTOR 的 literal argv。executor 必须调用：

```bash
enterprise-harness tdd-run <change-id> <task-id> <red|green|refactor> -- <literal argv>
```

standalone source checkout 的等价 fallback 是：

```bash
node harness/plugin/runtime/cli.mjs tdd-run <change-id> <task-id> <red|green|refactor> -- <literal argv>
```

runner 以 `spawnSync(command, args, { shell: false })` 真实执行命令。Java/Maven task 必须在 tasks 中冻结并实际执行 `mvn test`、`mvn verify` 或项目 wrapper；不存在“文字声明已执行”的降级路径。

## Receipt contract

receipt 写入 git common-dir spool，绑定：

- change/task 与 scoped executor `agent_id`
- worktree absolute path、git common dir、HEAD before/after、tree digest before/after
- exact argv、exit code、开始/结束时间、stdout/stderr digest
- 严格 RED → GREEN → REFACTOR 顺序

RED 必须非零；GREEN 与 REFACTOR 必须为零。receipt 必须同时存在 dispatch binding、Start、Stop 与合法 agent result，且不能来自未绑定或已结束的 agent。

## 集成与导入

executor 提交实现后，主 orchestrator 先把 implementation commit 集成到当前分支并完成独立 task review，然后执行：

```bash
enterprise-harness evidence-import <change-id> <task-id>
```

standalone fallback：

```bash
node harness/plugin/runtime/cli.mjs evidence-import <change-id> <task-id>
```

importer 校验 spool、agent 生命周期、worktree/git common dir、implementation patch 与 integration HEAD，再原子写入 `harness/changes/<change-id>/evidence/tdd/<task-id>.json`。verify、Stop 与 archive 只消费 durable imported evidence，不相信 worker 文本中的 `command-executed`、`summary` 或 `evidence-path`。

## 已知缺口：runtime 自举

修改 `harness/plugin/runtime/**` 自身时，本合同存在未解决的自举边界：执行 SOP 的 runtime
就是被修改的 runtime，隔离 executor 无法在不影响自身执行环境的前提下改写它。

历史处置各不相同，均已记录而非掩盖：

- `plugin-runtime-agent-dispatch-hardening` Task 1 使用受限 `runner-bootstrap` provenance，
  条件严格且只允许首个 task。
- 同 change Task 5 由主 orchestrator 直接在 main 上以 TDD 方式完成，无 receipt，
  记为该 change 的 W-2。

当前尚无正式轻量通道。在提供之前，涉及 runtime 自身的改动必须：

- 仍然先写失败测试并确认真实 RED
- 在 change 资产中显式记录执行方式与缺失的 receipt
- 不得把这类执行伪装成隔离 executor 产出

## 禁止事项

- 不运行真实命令就声称 RED/GREEN/REFACTOR
- 用手填 `state.gates.redVerified` 替代 receipt
- executor 自行 checkout/cherry-pick 猜测基线
- 并行执行会互相覆盖 receipt 的 task
- 缺独立 review 或 import 就进入 completion
