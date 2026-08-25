# Enterprise Harness Specs

本目录只保存长期运行合同。动态状态、路线图、营销、实现说明和历史证据不属于 spec。

## 八个主合同

1. [architecture.md](architecture.md)
2. [workflow.md](workflow.md)
3. [state-schema.md](state-schema.md)
4. [agents-and-handoff.md](agents-and-handoff.md)
5. [hooks.md](hooks.md) — session-scoped opt-in 写入治理、hook health、common-dir session/change-lock lease 与显式恢复路径
6. [evidence.md](evidence.md)
7. [testing.md](testing.md)
8. [distribution-and-release.md](distribution-and-release.md)

## 附录

- [development-target.md](development-target.md) — Claude Code 每次会话自动加载的已批准重构目标；明确目标与当前实现的边界、TECPC、Clarify 垂直闭环和实施顺序
- [ambiguity-scoring.md](ambiguity-scoring.md) — Clarify fact gate、evidence-bound readiness predicates、条件风险面与 Decision frontier
- [tdd-execution.md](tdd-execution.md)
- [verify-contract.md](verify-contract.md)
- [stage-observability.md](stage-observability.md) — 阶段时序、事件、artifact 与 `workflow audit` 的可执行合同
- [upstream-mapping.md](upstream-mapping.md) — 三套 Clarify 方法、Claude Code 职责边界与固定审阅来源
- [skill-packaging.md](skill-packaging.md) — Skill 目录结构、运行资源、研发 eval 分离和路径约定

每份现行 spec 必须声明 `status`、`owner`、`lastVerified`、`implementationRefs` 和 `testRefs`。主合同负责边界，附录不能重新描述整体架构。
