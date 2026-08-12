---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-04
implementationRefs:
  - harness/behavior-checks.json
  - runtime/lib/handoff.mjs
  - runtime/lib/agent-evidence.mjs
  - runtime/lib/spawn-depth.mjs
testRefs:
  - runtime/test/agent-lifecycle-hook-smoke.mjs
  - runtime/test/spawn-depth-guard-smoke.mjs
---

# Agents and Handoff Contract

## 上下文隔离的两层

```text
main conversation
└─ stage skill (context: fork)        ← 阶段 SOP 不进主上下文
   ├─ executor  (isolated subagent)
   └─ checker   (isolated subagent)
```

`harness` 必须留在主对话，因为 clarify 阶段要和用户一问一答；forked subagent 没有用户通道。route、design、plan、tdd、verify 以 `context: fork` + `background: false` 运行。

forked 阶段仍必须派自己的 executor 和 checker，因此 subagent 生成深度至少需要 2。到达深度上限时 `Agent` 工具会被静默收走，forked 阶段就会自写自审、塌成单一上下文 —— 这是本合同不接受的降级。本仓库用 `.claude/settings.json` 的 `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` 兜住；该文件由 `bin/generate-hooks.mjs` 生成，不要手改。

已知缺口：`.claude/settings.json` 不在 `bin/package.mjs` 的发布白名单内，所以安装 plugin 的用户拿不到这个 guard。发布通道的兜底是 runtime 侧 fail-loud：`runtime/lib/spawn-depth.mjs` 求值当前深度，session-start hook 以 `EH-SPAWN-DEPTH-020` 报出，`doctor` 在深度低于 2 时判 fail。静默降级因此变成显式诊断。

需要用户确认的动作（例如 route 的 tier 确认与 `workflow.routeReady` 置位）由主 orchestrator 承担，forked 阶段只返回待确认项。

## 每个受治理行为

```text
orchestrator
→ execute input
→ isolated executor
→ result
→ check input(parentRunId + result ref)
→ isolated checker
→ verdict
```

executor 与 checker 使用不同 runId 和 subagent 上下文。checker 不读取 executor 聊天，只读取 digest 绑定的 result artifact。

executor/checker 对不得跨 stage 复用：同一对同时服务两个阶段时，后一阶段的 checker 会复核自己在前一阶段提供过的输入，失去独立视角。clarify 用 `clarify-synthesizer` / `clarify-reviewer`，route 用 `route-decider` / `requirement-reviewer`。

Handoff input 必含：

- handoffVersion、runId、changeId
- stage、behavior、role
- parentRunId（checker）
- agent type、preloaded skill
- TECPC target/evidence/context/path/correction
- inputRefs 和 digests

Result 必须回显身份字段，并包含 outputRefs、blockers、summary；checker 还必须有 verdict。

协议合同由 `harness` skill 的 `refs/protocol/` 提供；executor/checker 不再作为独立 Skill 暴露，`agent.skill` 统一记录为 `harness`，而 `role=execute|check` 与 behavior registry 继续区分两种运行合同。

ledger 绑定 dispatch、toolUseId、start、agentId、result 和 stop。任一身份不一致均 BLOCK。

brief 是 inputRef 的人类可读部分，不是第二套 schema。
