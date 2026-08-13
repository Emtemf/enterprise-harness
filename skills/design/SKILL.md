---
name: design
description: Produce digest-bound, reviewable technical design artifacts.
user-invocable: false
context: fork
---

# Design

Produce the durable design from confirmed requirements and classification. Cover applicable
interfaces, error model, authentication/idempotency, data/SQL, migration/rollback, compatibility,
concurrency, component boundaries, and tests. Mark non-applicable areas as `N/A` with a reason.

## Quality loop

Write a self-check artifact, then request an independent review through a separate v2 run. A
worker that lacks a business decision returns `NEEDS_DECISION`; only main Harness prompts users.
