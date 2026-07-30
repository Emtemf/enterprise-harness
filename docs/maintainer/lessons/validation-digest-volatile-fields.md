---
id: validation-digest-volatile-fields
severity: high
tags: [validation, digest, state, smoke]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# validation digest 把易变字段算进 hash 导致反复 mismatch

## 症状

修改 `state.json` 或跑任意 workflow / smoke 之后，`cli.mjs verify` 反复报
`validation digest mismatch`；手动重算 digest 后又很快再次变红，绿只是暂时的。

## 根因

`computeValidationDigest` 把每次 workflow 交互都会 bump/append 的易变项也纳入了 hash：

- `state.json` 的 `revision` / `lastEventId`
- `evidence/workflow-events.jsonl`（append-only 事件流）

于是每跑一次 workflow runner（包括 smoke）就把 digest 打成 mismatch。

## 规避

- validation digest 只应覆盖**稳定验证内容**，不得包含每次交互都会变的 bookkeeping。
- 在 `computeValidationDigest` 中显式剔除 `revision`、`lastEventId` 与
  `evidence/workflow-events.jsonl`。
- 改动 durable 内容后要重算 digest；但纯 bookkeeping 变动不应触发重算需求。

## 关联

- 见 `harness/plugin/runtime/lib/checks.mjs` 的 `computeValidationDigest`
