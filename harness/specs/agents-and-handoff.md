---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/behavior-checks.json
  - harness/plugin/runtime/lib/handoff.mjs
  - harness/plugin/runtime/lib/agent-evidence.mjs
testRefs:
  - harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs
---

# Agents and Handoff Contract

每个受治理行为：

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

Handoff input 必含：

- handoffVersion、runId、changeId
- stage、behavior、role
- parentRunId（checker）
- agent type、preloaded skill
- TECPC target/evidence/context/path/correction
- inputRefs 和 digests

Result 必须回显身份字段，并包含 outputRefs、blockers、summary；checker 还必须有 verdict。

ledger 绑定 dispatch、toolUseId、start、agentId、result 和 stop。任一身份不一致均 BLOCK。

brief 是 inputRef 的人类可读部分，不是第二套 schema。
