---
name: test-design
description: 从冻结输入生成持久测试用例设计。
argument-hint: HANDOFF_INPUT=<canonical-input.json-path>
user-invocable: false
context: fork
agent: enterprise-harness:test-design-worker
---

# Test Design

本 Skill 在隔离上下文中消费冻结 handoff，生成当前 change 的 `test-cases.md`；不执行测试、不修改产品代码、state、design.md 或其他阶段制品，也不替用户做业务决策。

本次唯一 handoff：

```text
$ARGUMENTS
```

## 必须执行的流程

固定顺序是：marker prepare → frozen inputs only → template → self-check → finalizer → Main independent review。

1. `$ARGUMENTS` 必须且只能是 Main 传入的原样 canonical marker。Task 4 将提供并绑定未来的 scripts/prepare-input.mjs 执行 marker prepare；该脚本存在前不得把 handoff 文本当作已经校验的输入，也不得用空脚本伪造完成。
2. prepare 成功后只读取其返回的冻结输入和摘要：approved requirements、Architecture Design 与 classification/impact。只接受 requirements 中声明的 `R<number>` 和 Design 中已接受的 `D<number>`、`VO<number>`；stale、缺失或摘要不一致立即返回恢复动作。
3. 始终读取 `references/method.md` 和 `references/artifact-contract.md`，使用 `assets/test-cases.md.tmpl` 生成 `test-cases.md`。每个完整 TC 恰好十列，使用稳定 `TC<number>`、允许的 level/priority/status，并给出具体数据、动作、可观察断言和清理/恢复。
4. 依 `references/self-check.md` 完成 Test Design Self-Check。缺少真实业务选择时返回一个紧凑 `NEEDS_DECISION`；不得保留 placeholder 或用“验证成功”伪装 observable assertion。
5. Task 4 将提供未来的 scripts/finalize-result.mjs 并绑定 ArchitectureProof。finalizer 届时统一执行 `assert/artifact-shape.mjs`、`assert/coverage.mjs`、`assert/traceability.mjs`；在 Task 4 依赖落地前，本 Skill 只定义语义合同，不把这些未来脚本当作可执行 shell。
6. finalizer 成功后只能把持久化 StageResult、artifact 路径和一个下一动作返回 Main。Main 必须创建不同 run 的独立 review，并使用 `skills/review/references/test-design.md`；worker 不自批。

## 行为边界

- 不执行测试、verify 或构建，不调用浏览器，也不探测外部环境。
- 不冻结 exact argv、工具版本或 shell 命令；这些由后续 Plan 基于冻结 Test Design 决定。
- 不修改 requirements、design、classification、产品代码或 lifecycle state。
- 只输出公开可审计的测试设计结论，不输出隐藏推理。

## Supporting files

- `assets/test-cases.md.tmpl` — 唯一 `test-cases.md` 输出骨架。
- `references/method.md` — coverage、风险优先级、用例、E2E 与数据生命周期方法。
- `references/artifact-contract.md` — 七个章节、十列用例和 fail-closed 语义合同。
- `references/self-check.md` — worker 提交前自检。
- `references/examples.md` — 有效/无效形状示例。
- `assert/artifact-shape.mjs` — 验证章节、表形、枚举、ID、断言和 N/A 理由。
- `assert/coverage.mjs` — 验证 R/VO、critical failure 和 applicable E2E 覆盖。
- `assert/traceability.mjs` — 验证 R/D/VO/TC 引用闭合。
- `evals/evals.json` — 正确生成和 adversarial 行为回归场景。
- Task 4 dependency：未来的 scripts/prepare-input.mjs 与 scripts/finalize-result.mjs；本 Task 不创建或执行。
