---
name: implement
description: 使用策略匹配的真实执行收据完成一个冻结任务。
user-invocable: false
context: fork
---

# Implement

`implementer` capability 是 v0.5 中唯一允许修改产品代码的 capability。需要时在原生隔离 worktree 中执行。执行冻结的 exact argv，并记录符合 task `executionStrategy` 的 machine-generated receipt：`tdd` 使用真实 RED → GREEN → REFACTOR；`regression` 使用 REPRODUCE → VERIFY；`characterization` 使用 BASELINE → VERIFY；`direct` 使用 VERIFY；`migration` 使用 DRY_RUN → APPLY → ROLLBACK；`generation` 使用 GENERATE → VERIFY。不得伪造或为非 TDD task 强制要求 RED evidence。

## Quality loop

创建 task self-check，并获取绑定 receipt 与 input digest 的独立 reviewer verdict。不得仅凭聊天输出或 worktree isolation 声称 task 完成。