# 最小完整示例

## execute 结果（clarify.explore-code）

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "ch-001-clarify-clarify.explore-code-execute-1754870000",
  "changeId": "ch-001",
  "stage": "clarify",
  "behavior": "clarify.explore-code",
  "role": "execute",
  "agent": {
    "type": "enterprise-harness:code-explore",
    "skill": "harness-stage-executor"
  },
  "tecpc": {
    "target": "探索 UserService 的依赖边界，确认是否有外部调用方",
    "evidence": ["codegraph_explore UserService → 返回3个调用方", "harness/changes/ch-001/evidence/code-exploration.md 已写入"],
    "context": ["input.json#inputRefs[0]: requirements.md"],
    "path": "codegraph_explore → 发现依赖，fallback 未触发 → 返回主 orchestrator",
    "correction": "无阻断"
  },
  "outputRefs": ["harness/changes/ch-001/evidence/code-exploration.md"],
  "blockers": [],
  "summary": "UserService 有3个调用方（OrderController、PaymentService、AdminController）；无外部跨服务依赖。"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

## blocker 示例（输入不足）

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "ch-001-tdd-tdd.execute-task-execute-1754870100",
  "changeId": "ch-001",
  "stage": "tdd",
  "behavior": "tdd.execute-task",
  "role": "execute",
  "agent": { "type": "enterprise-harness:tdd-executor", "skill": "harness-stage-executor" },
  "tecpc": {
    "target": "执行 task-003 的 RED/GREEN/REFACTOR",
    "evidence": [],
    "context": ["input.json 中 task-id 缺失"],
    "path": "无法执行",
    "correction": "在 input.json 的 brief 中明确提供 task-id、touched-files 和冻结 argv"
  },
  "outputRefs": [],
  "blockers": ["input.json 缺少 task-id 和冻结 argv，无法执行 TDD"],
  "summary": "blocker：输入不足，等待主 orchestrator 补充。"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```
