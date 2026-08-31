# Enterprise Harness Specs

本目录只保存长期运行合同。动态状态、路线图、营销、实现说明和历史证据不属于 spec。

## 九个主合同

1. [architecture.md](architecture.md) — Claude Code-only surface and the compound-but-six-stage Design boundary
2. [workflow.md](workflow.md) — six lifecycle stages, Design internal proof sequence, downstream test-case authority, and Plan dual-artifact freeze
3. [state-schema.md](state-schema.md)
4. [agents-and-handoff.md](agents-and-handoff.md)
5. [hooks.md](hooks.md) — session-scoped opt-in 写入治理、UserPromptSubmit 摘要凭据、共享写 lease/独占 transaction 与自动异常恢复
6. [evidence.md](evidence.md) — digest-bound artifacts, compound DesignProof, canonical TC receipts and archive attestation
7. [testing.md](testing.md)
8. [distribution-and-release.md](distribution-and-release.md)
9. [clarify-governance.md](clarify-governance.md) — Clarify 权威来源、只读歧义指数、不可变决策/评估合同、proof-free transition readiness、transition-owned proof 发布、单问题授权与重启恢复

## 附录

- [development-target.md](development-target.md) — Claude Code 每次会话自动加载的已批准重构目标；明确目标与当前实现的边界、TECPC、Clarify 垂直闭环、compound Design 和实施顺序
- [ambiguity-scoring.md](ambiguity-scoring.md) — Clarify fact gate、evidence-bound readiness predicates、条件风险面与 Decision frontier
- [tdd-execution.md](tdd-execution.md)
- [verify-contract.md](verify-contract.md)
- [stage-observability.md](stage-observability.md) — 阶段时序、Design 内部顺序、artifact、独立 review、transition-owned persisted proof gate 与 `workflow audit` 的可执行合同
- [upstream-mapping.md](upstream-mapping.md) — 三套 Clarify 方法、Claude Code 职责边界与固定审阅来源
- [skill-packaging.md](skill-packaging.md) — Skill 目录结构、运行资源、研发 eval 分离和路径约定

每份现行 spec 必须声明 `status`、`owner`、`lastVerified`、`implementationRefs` 和 `testRefs`。主合同负责边界，附录不能重新描述整体架构。
