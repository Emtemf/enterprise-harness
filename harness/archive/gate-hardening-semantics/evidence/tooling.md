# Tooling Evidence

## codegraph

- Status: available
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `How are designApproved, redVerified, validation freshness, and reviewer verdicts currently enforced in this repo? Focus on runtime hooks, gate helpers, verify/checks files, and any explicit gaps around plan/task gates for issue #11.`
- Key Findings:
  - `pre-write` 只在受治理路径消费 `designApproved` 与 `redVerified`
  - `stop` 只在 `REVIEWED` / `VALIDATED` 且 `validation.status!=fresh` 时阻断结束
  - `validateReviewVerdicts()` 只校验 reviewer verdict 文件结构，不消费 verdict 结果推进/阻断状态
  - `lifecycle.mjs` 当前已有 `design-approved` / `red-verified` / `reviewed` / `validated` 动作，但没有 plan gate / task gate 对应的显式动作
- Fallback Reason: 无

## Context7

- Status: not-needed
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 本轮问题主要是仓库内 gate 语义与 runtime 消费逻辑，不涉及外部库/框架版本行为
- Fallback Reason: 不需要

## Vendor / Official Docs

- Source:
- Version / Snapshot:
- Query:
- Key Findings: 不需要
