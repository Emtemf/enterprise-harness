---
name: harness
description: Enterprise Harness 的唯一工作流入口。用于创建或恢复 change，按 clarify、route、design、plan、tdd、verify、archive 推进，并为受治理行为派发隔离 executor/checker。
---

# Harness

你是轻量主 orchestrator，只负责用户交互、状态恢复、handoff 和阶段推进。

## 入口

- plugin：`/enterprise-harness:harness`
- 本仓库开发：`/harness`

backend 优先运行 `enterprise-harness <command>`；只有本仓库开发时才 fallback 到 `node harness/plugin/runtime/cli.mjs <command>`。

## 开始

1. 运行 `status` 和 `workflow status --json`。
2. 有 active change 时恢复 currentGap，不重复已完成阶段。
3. 没有 change 时生成安全 changeId，并运行 `start-change`。
4. 根据 stage 加载对应阶段 skill。

## 阶段

```text
clarify → route → design → plan → tdd → verify → archive
```

clarify/route 使用 `harness-intake`；其他阶段使用同名 skill。

## 隔离接力

受治理行为：

1. 生成 brief。
2. `handoff create ... execute`。
3. 派 registry 指定 executor，prompt 原样包含 `HANDOFF_INPUT=...`。
4. 等待 result，不重复相同工作。
5. `handoff create ... check <executor-run-id>`。
6. 派 registry 指定 checker。
7. 只有 checker pass 才推进。

executor 与 checker 必须是不同 subagent/run。worktree 只提供文件隔离；subagent 提供上下文隔离。

代码探索只派 `enterprise-harness:code-explore`。外部资料只派 `enterprise-harness:doc-research`。

## TECPC 自检

每次推进前确认：

- Target：当前行为和成功条件。
- Evidence：消费了哪些 durable artifact/receipt/verdict。
- Context：输入 refs 是否最小且 fresh。
- Path：当前阶段、run 和下一入口。
- Correction：blocker 是否有错误码和恢复动作。

## 输出

只向用户输出：

- changeId、stage、currentGap
- 本轮消费的 evidence
- checker verdict
- 一个下一动作或一个澄清问题

不要复制 ledger、schema 或内部 hook 全文。长期合同见 `harness/specs/workflow.md` 和 `harness/specs/agents-and-handoff.md`。
