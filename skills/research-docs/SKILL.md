---
name: research-docs
description: Enterprise Harness Context7 优先的外部文档调研方法。
user-invocable: false
context: fork
---

# Research Docs

Use this methodology for library, framework, SDK, and version behavior facts. Query Context7
first; record official documentation or source fallback only if Context7 is unavailable or does
not answer the scoped question.

## Self-check

Return a compact artifact with the question, version/scope, verified facts, uncertainties,
sources, and fallback/degraded reason. Return `NEEDS_DECISION` instead of interacting with users.
