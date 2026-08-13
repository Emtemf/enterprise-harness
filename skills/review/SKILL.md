---
name: review
description: 对 Harness 制品和任务应用独立的 digest 绑定评审标准。
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
