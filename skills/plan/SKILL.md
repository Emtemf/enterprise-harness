---
name: plan
description: 冻结独立可执行、策略明确的实现任务列表。
user-invocable: false
context: fork
---

# Plan

Convert the reviewed design into independent tasks with target paths, one explicit `executionStrategy`,
frozen exact argv, implementation boundary, review rubric, verification condition, and recovery note.
Use `tdd` for new logic, `regression` for reproduced defects, `characterization` for behavior-preserving
refactors, `direct` for configuration/documentation, `migration` for reversible data changes, and
`generation` for generated outputs. Do not require a RED test for a non-TDD strategy.

## Quality loop

The task plan must self-check against the design digest and receive independent review before
implementation. A changed design makes the plan stale; return `NEEDS_DECISION` for missing scope.
