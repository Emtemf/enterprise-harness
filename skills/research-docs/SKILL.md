---
name: research-docs
description: Enterprise Harness Context7 优先的外部文档调研方法。
user-invocable: false
context: fork
---

# Research Docs

本方法论用于库、framework、SDK 与版本行为事实。优先查询 Context7；只有 Context7 不可用或无法回答已限定的问题时，才记录官方文档或源码 fallback。

## Self-check

返回精简 artifact，包含问题、版本/范围、已验证事实、不确定性、来源和 fallback/degraded 原因。需要用户业务决策时返回 `NEEDS_DECISION`，不得直接与用户交互。