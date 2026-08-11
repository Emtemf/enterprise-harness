# Checker HANDOFF_RESULT 合同

最后必须输出以下定界块；JSON 可以多行，但定界符必须独占一行：

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "<checker input runId>",
  "changeId": "<与 input 完全相同>",
  "stage": "<与 input 完全相同>",
  "behavior": "<与 input 完全相同>",
  "role": "check",
  "agent": {
    "type": "<与 input 完全相同>",
    "skill": "harness-stage-checker"
  },
  "tecpc": {
    "target": "独立检查目标",
    "evidence": ["实际核验的证据条目"],
    "context": ["被消费的最小引用（parentRunId 指向的 executor result）"],
    "path": "verdict 依据和下一步",
    "correction": "block 时的明确恢复动作；pass 时写'无'"
  },
  "verdict": "pass | block | advisory",
  "outputRefs": ["被核验的 artifact 路径"],
  "blockers": [],
  "summary": "压缩 verdict"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

**关键约束**：
- `role` 固定为 `"check"`
- `verdict` 必须是 `pass`、`block` 或 `advisory` 之一，不得省略
- 关键证据缺失必须 `block`，不得降级为 `advisory`
- `correction` 在 block 时必须给出具体恢复动作，不得写"无"或空
- 不得在同一上下文里把自己的修改当成独立 review
