# Enterprise Harness Specs

本目录只保存长期运行合同。动态状态、路线图、营销、实现说明和历史证据不属于 spec。

## 八个主合同

1. [architecture.md](architecture.md)
2. [workflow.md](workflow.md)
3. [state-schema.md](state-schema.md)
4. [agents-and-handoff.md](agents-and-handoff.md)
5. [hooks.md](hooks.md)
6. [evidence.md](evidence.md)
7. [testing.md](testing.md)
8. [distribution-and-release.md](distribution-and-release.md)

## 附录

- [ambiguity-scoring.md](ambiguity-scoring.md)
- [tdd-execution.md](tdd-execution.md)
- [verify-contract.md](verify-contract.md)
- [stage-observability.md](stage-observability.md) — 阶段时序、事件、artifact 与 `workflow audit` 的可执行合同
- [upstream-mapping.md](upstream-mapping.md)

每份现行 spec 必须声明 `status`、`owner`、`lastVerified`、`implementationRefs` 和 `testRefs`。主合同负责边界，附录不能重新描述整体架构。
