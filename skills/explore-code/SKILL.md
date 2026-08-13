---
name: explore-code
description: Enterprise Harness CodeGraph 优先的代码事实发现方法。
user-invocable: false
context: fork
---

# Explore Code

Use this methodology only for code facts. Dispatch the `code-explore` capability directly from
main Harness with a v2 handoff. Start with CodeGraph; fall back to focused Read/Grep only when
the index is unavailable or insufficient, recording the fallback reason in the research artifact.

## Self-check

Before returning, ensure the artifact states the question, scope, facts, uncertainties, impact,
sources, and any suggested user question. Return `NEEDS_DECISION` rather than prompting a user.
