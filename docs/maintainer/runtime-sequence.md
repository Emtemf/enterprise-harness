# Runtime 时序

```mermaid
sequenceDiagram
  participant U as User
  participant O as Orchestrator
  participant R as Runtime
  participant E as Executor
  participant C as Checker
  U->>O: /enterprise-harness:harness
  O->>R: workflow status
  R-->>O: current stage/gap
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
  O->>R: advance/verify
  R-->>U: status or stable error code
```

关键失败路径：

- input 缺失：`EH-HANDOFF-INPUT-001`
- schema 漂移：`EH-HANDOFF-SCHEMA-002`
- agent/run 不一致：`EH-AGENT-BINDING-003`
- result 无法解析：`EH-SUBAGENT-RESULT-004`
- checker 缺失：`EH-CHECKER-REQUIRED-005`

输出示例不在本文手写维护。CLI 输出由行为测试和 JSON contract 验证。

Design remains one of the six lifecycle stages. The seal is only legal after the architecture execute/review
chain; `test-design` only consumes that sealed chain; Plan, Verify, and Archive consume the resulting compound
`DesignProof` and current `test-cases.md`. Detailed test-case schema and gate rules belong to the specs/runtime, not
this timing guide.
