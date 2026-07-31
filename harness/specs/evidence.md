---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - runtime/lib/evidence-policy.mjs
  - runtime/lib/tdd-receipts.mjs
  - runtime/lib/checks.mjs
testRefs:
  - runtime/test/evidence-policy-contract-smoke.mjs
  - runtime/test/tdd-receipt-contract-smoke.mjs
---

# Evidence Contract

## Receipt

机器生成，记录 agent、worktree、command argv、exit、时间、HEAD/tree digest 和 changed paths。文本自报不算 receipt。

## Ledger

append-only 记录 dispatch、start、binding、attempt、stop 和 violation。伪造 agentId、重放 runId 或不匹配 parentRunId 必须 BLOCK。

## Policy

目标仓库首次安装时基于自己的 Git HEAD 生成 sealed evidence policy。发布包不得携带源仓库 policy 或 legacyChangeIds。

## Freshness

validation digest 覆盖稳定 artifact 和实现 commit。受治理写入后 validation 变 stale。

## Completion

completion 分层返回 `{code,status,path,message,recovery}`：

- state
- artifacts
- reviews
- TDD evidence
- agent ledger
- API contract
- final completion

`unsupported` 不能提升为 pass。
