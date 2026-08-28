---
name: design
description: >
  用于 Clarify 已批准且冻结输入齐备，需要生成可供独立评审和 Plan 消费的技术设计时。
argument-hint: HANDOFF_INPUT=<canonical-input.json-path>
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
---

# Design

本 Skill 在隔离上下文中把已批准 requirements 转换成摘要绑定的 `design.md` 和 schema-valid `StageResult`。它不写产品代码、不把 self-check 当 approval；只有主 Harness 可以向用户提问，并拥有用户决策和 stage transition 权限。

本次唯一 handoff：

```text
$ARGUMENTS
```

## 必须执行的流程

1. `$ARGUMENTS` 必须且只能是 Main 从 `handoff create` 获得的原样 `HANDOFF_INPUT=<canonical input.json path>`。运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/prepare-input.mjs" "HANDOFF_INPUT=<canonical-input.json-path>"
   ```

   prepare 从 marker 读取并交叉校验 `changeId`、`runId`、agent identity 和 digest。非零退出立即返回其错误码和恢复动作；不得从聊天猜测这些值。

2. 只读取 prepare 输出中的 `inputRefs`，并以 `inputDigests` 为冻结事实边界。始终读取 `references/method.md`、`references/artifact-contract.md` 和 `references/quality-design.md`；仅按 `conditionalReferences` 读取 `references/api-design.md` / `references/data-design.md`。

3. 使用 `assets/design.md.tmpl` 生成 `harness/changes/<change-id>/design.md`。每个 requirement 必须形成：

   ```text
   R* → D* → E* → V* → RB*
   ```

   同时覆盖组件边界、交互与失败路径、适用 API/Data/SQL/migration、安全/并发、兼容/回滚、observability、技术债处置、测试设计和真实 alternatives。

4. 依 `references/self-check.md` 自检，并读取 `../harness/references/downstream-pitfalls.md` 的 Design 行。技术事实缺口返回 Main 重新 research；真实业务选择返回一个紧凑 `NEEDS_DECISION`。存在未决项时不得运行 finalizer。

5. 运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <run-id>
   ```

   finalizer 统一执行 `assert/artifact-shape.mjs`、`assert/requirement-coverage.mjs` 和 `assert/traceability.mjs`，并把 passing StageResult 原子持久化到当前 v2 execute run。任一 block 都先修正制品再重跑，不能改 state 或 assertion 绕过。

6. finalizer 成功后，返回 Main 的内容仅包含已持久化 StageResult、制品路径和一个下一动作；不附带隐藏推理，也不再使用 shell 重定向或第二套 persist 路径。

7. Main 必须创建不同 run 的独立 `review`。只有 fresh StageResult、passing ReviewResult、完整 TECPC 与 DesignProof 全部通过后才能进入 Plan。

## 粒度边界

Design 冻结 User Story 级架构和契约，不提前冻结 Task 级类名、方法名、完整文件清单、设计模式或 exact argv；除非已有代码事实证明这些是不可替代的扩展点。

## Supporting files

- `assets/design.md.tmpl` — 唯一 Design 输出骨架。
- `references/method.md` — 设计顺序、事实边界与粒度。
- `references/artifact-contract.md` — 产物语义和完成证据。
- `references/quality-design.md` — 安全、并发、observability 与测试设计。
- `references/api-design.md` / `references/data-design.md` — impact 条件分支。
- `references/self-check.md` — worker 自检。
- `references/examples.md` — trace 形状示例。
- `scripts/prepare-input.mjs` / `scripts/finalize-result.mjs` — 冻结输入和生成 StageResult。
- `assert/artifact-shape.mjs` / `assert/requirement-coverage.mjs` / `assert/traceability.mjs` — 确定性门禁。
- `evals/evals.json` — 行为回归场景。
