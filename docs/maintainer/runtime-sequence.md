# Runtime 时序

```mermaid
sequenceDiagram
  participant U as User
  participant O as Orchestrator
  participant R as Runtime
  participant E as Executor
  participant C as Checker
  U->>O: /enterprise-harness:harness
  O->>R: workflow status --json
  R-->>O: one recovery or stage route
  O->>R: handoff create execute
  O->>E: Agent + HANDOFF_INPUT
  E->>R: structured HANDOFF_RESULT
  R-->>O: persisted result + ledger
  O->>R: handoff create check(parentRunId)
  O->>C: Agent + HANDOFF_INPUT
  C->>R: verdict
  R-->>O: persisted check + ledger
  rect rgb(232, 241, 255)
    Note over O,C: Design only: architecture execute/review → seal → test-design execute/review
    O->>R: architecture result/review verified
    O->>R: design seal-architecture
    O->>R: handoff create design.test-cases execute
    O->>E: test-design-worker + HANDOFF_INPUT
    E->>R: test-cases.md + StageResult
    O->>R: handoff create design.test-cases review
    O->>C: independent test-design review
    C->>R: ReviewResult
    R-->>O: runtime verifies both chains and persists compound DesignProof
  end
  loop one durable action per Main turn
    O->>R: fresh workflow status --json
    R-->>O: exact stageReadiness route
    O->>E: produce or execute-task
    O->>C: independent review
    opt Implement task passed
      O->>R: task-integrate exact reviewed paths
    end
    O->>R: lifecycle transition when ready
  end
  O->>R: archive-finalize after archive review
  R->>R: atomic move and offline manifest revalidation
  R-->>U: archived or one stable recovery code
```

关键失败路径：

- input 缺失：`EH-HANDOFF-INPUT-001`
- schema 漂移：`EH-HANDOFF-SCHEMA-002`
- agent/run 不一致：`EH-AGENT-BINDING-003`
- result 无法解析：`EH-SUBAGENT-RESULT-004`
- checker 缺失：`EH-CHECKER-REQUIRED-005`

输出示例不在本文手写维护。CLI 输出由行为测试和 JSON contract 验证。

Design 仍是六个生命周期阶段之一。只有 architecture execute/review 链闭合后才能 seal；`test-design` 只消费
该 fresh sealed chain；Plan、Verify 和 Archive 消费 compound `DesignProof` 与当前 `test-cases.md`。

Design 后 Main 不根据聊天或文件存在性猜动作。每轮重新读取 runtime 投影，只执行一个
produce/review/integrate/select/transition/finalize route；中断、重启或 compaction 后使用相同机制恢复。
详细 schema、命令和 gate 仍以 specs/runtime 为准，不在本时序说明中复制。
