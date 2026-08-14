---
name: archive
description: 校验完成证据并归档不可变的变更历史。
user-invocable: false
context: fork
---

# Archive

只有 fresh verification 与独立 archive-completeness review 满足 completion predicate 后才可归档。将 durable artifact 保留为不可变历史；只在物理移动后清理 compatibility pointer；未完成工作必须显式 abandon。

## Self-check

确认不存在 stale artifact、所有必需 TECPC/review 均已存在，且 source/destination path 安全。未解决 waiver 或范围决策时返回 `NEEDS_DECISION`。