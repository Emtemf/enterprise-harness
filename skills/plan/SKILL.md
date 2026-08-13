---
name: plan
description: 冻结独立可执行、测试优先的实现任务列表。
user-invocable: false
context: fork
---

# Plan

Convert the reviewed design into tasks with target paths, minimum RED test, frozen exact argv,
implementation boundary, review rubric, verification condition, and recovery note.

## Quality loop

The task plan must self-check against the design digest and receive independent review before
implementation. A changed design makes the plan stale; return `NEEDS_DECISION` for missing scope.
