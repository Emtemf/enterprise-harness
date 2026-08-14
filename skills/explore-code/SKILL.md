---
name: explore-code
description: Enterprise Harness CodeGraph 优先的代码事实发现方法。
user-invocable: false
context: fork
---

# Explore Code

本方法论只用于代码事实。主 Harness 通过 v2 handoff 直接派发 `code-explore` capability。先使用 CodeGraph；只有索引不可用或信息不足时，才回退到定向 Read/Grep，并在 research artifact 中记录 fallback 原因。

## Self-check

返回前确认 artifact 写明问题、范围、事实、不确定性、影响、来源和建议的用户问题。需要业务决策时返回 `NEEDS_DECISION`，不得直接询问用户。