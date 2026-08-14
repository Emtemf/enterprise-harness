---
name: review
description: 对 Harness 制品和任务应用独立的 digest 绑定评审标准。
user-invocable: false
context: fork
---

# Review

`reviewer` capability 独立评估提供的 artifact/result，而非 worker 对话。根据 durable impact 与 task metadata 选择 requirements、classification、design、plan、task、API、data、security、final 或 archive-completeness rubric。

## Output

返回 TECPC，并准确使用 `pass`、`advisory`、`block` 或 `unsupported`。只有 `pass` 可令 `correction` 为 null；其他所有结果都必须给出可执行 correction。