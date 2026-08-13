---
name: review
description: Apply independent, digest-bound review rubrics to Harness artifacts and tasks.
user-invocable: false
context: fork
---

# Review

The `reviewer` capability independently evaluates the supplied artifact/result, not the worker
conversation. Select requirements, classification, design, plan, task, API, data, security,
final, or archive-completeness rubrics from durable impact and task metadata.

## Output

Return TECPC. Use `pass`, `advisory`, `block`, or `unsupported` accurately. `correction` is null
only for pass; all other outcomes require actionable correction.
