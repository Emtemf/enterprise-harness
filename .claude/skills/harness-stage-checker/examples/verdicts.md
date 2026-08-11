# Checker 示例

## pass 示例（探索结论完整）

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "ch-001-clarify-clarify.explore-code-check-1754870001",
  "changeId": "ch-001",
  "stage": "clarify",
  "behavior": "clarify.explore-code",
  "role": "check",
  "agent": {
    "type": "enterprise-harness:clarify-reviewer",
    "skill": "harness-stage-checker"
  },
  "tecpc": {
    "target": "独立验证代码探索 artifact 是否覆盖了 clarify 所需事实",
    "evidence": ["读取 code-exploration.md → 包含调用方列表和边界分析", "artifact digest 与 result.json 中声明值一致"],
    "context": ["executor result.json (parentRunId: ch-001-clarify-clarify.explore-code-execute-1754870000)"],
    "path": "artifact 内容完整，无遗漏边界 → pass",
    "correction": "无"
  },
  "verdict": "pass",
  "outputRefs": ["harness/changes/ch-001/evidence/code-exploration.md"],
  "blockers": [],
  "summary": "探索结论完整，覆盖了 UserService 的3个调用方和外部依赖边界。"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

## block 示例（artifact 内容不足）

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "ch-001-clarify-clarify.explore-code-check-1754870002",
  "changeId": "ch-001",
  "stage": "clarify",
  "behavior": "clarify.explore-code",
  "role": "check",
  "agent": {
    "type": "enterprise-harness:clarify-reviewer",
    "skill": "harness-stage-checker"
  },
  "tecpc": {
    "target": "独立验证代码探索 artifact 是否覆盖了 clarify 所需事实",
    "evidence": ["读取 code-exploration.md → 缺失 PaymentService → UserService 入参约束"],
    "context": ["executor result.json (parentRunId: ch-001-clarify-clarify.explore-code-execute-1754870000)"],
    "path": "Data/SQL 维度依赖入参约束事实，当前 artifact 未覆盖 → block",
    "correction": "重跑 clarify.explore-code，在 brief 中明确要求分析 PaymentService 入参约束"
  },
  "verdict": "block",
  "outputRefs": ["harness/changes/ch-001/evidence/code-exploration.md"],
  "blockers": ["code-exploration.md 未分析 PaymentService → UserService 的入参约束，clarify 阶段 Data/SQL 维度依赖此事实"],
  "summary": "block：探索结论不完整，需补充 PaymentService 入参分析。"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

## advisory 示例（可继续但建议补强）

```json
"verdict": "advisory",
"blockers": [],
"tecpc": { "correction": "建议在 evidence 中补充 OrderController 的并发模型说明，当前不影响 clarify 推进但 design 阶段会用到" }
```
