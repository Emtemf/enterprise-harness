---
name: implement
description: 使用策略匹配的真实执行收据完成一个冻结任务。
user-invocable: false
context: fork
---

# Implement

The `implementer` capability is the only v0.5 capability permitted to change product code. Work
in a native isolated worktree when required. Execute the frozen exact argv and record a
machine-generated receipt matching the task's `executionStrategy`: `tdd` uses meaningful RED →
GREEN → REFACTOR; `regression` uses REPRODUCE → VERIFY; `characterization` uses BASELINE →
VERIFY; `direct` uses VERIFY; `migration` uses DRY_RUN → APPLY → ROLLBACK; and `generation` uses
GENERATE → VERIFY. Do not fabricate or require RED evidence for a non-TDD task.

## Quality loop

Create a task self-check and obtain an independent reviewer verdict bound to the receipt and input
digests. Do not claim task completion from chat output or worktree isolation alone.
