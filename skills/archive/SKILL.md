---
name: archive
description: 校验完成证据并归档不可变的变更历史。
user-invocable: false
context: fork
---

# Archive

Archive only after fresh verification and independent archive-completeness review satisfy the
completion predicate. Preserve durable artifacts as immutable history, clear compatibility
pointers only after the move, and use explicit abandonment for incomplete work.

## Self-check

Confirm no artifact is stale, all required TECPC/reviews are present, and the source/destination
paths are safe. Return `NEEDS_DECISION` for an unresolved waiver or scope decision.
