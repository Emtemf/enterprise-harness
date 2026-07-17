# Exploration

## Topic

session lifecycle / progress surface / startup summary / stop handoff

## Date

2026-07-15

## Request Shape

modify

## Candidate Tier

L3

## Owning Module / Domain / Service

- module: `harness/plugin/runtime`
- module: repo-facing contract docs (`README.md`, `AGENTS.md`, `CLAUDE.md`)
- domain: `harness-governance`

## Codegraph Attempt
- Status: ready
- Queries:
  - `session start hook stop hook memory progress active change runtime verify start-change repo entry current status docs and hooks for enterprise harness`
  - `runtime verify doctor status-like smoke tests hook tests scripts patterns in harness/plugin/runtime and hooks`
- Key Findings:
  - `session-start.mjs` 目前只输出启动检查与入口提示，无法直接回答“现在做到哪里了”
  - `stop.mjs` 目前只做 validation freshness 相关门禁，尚未把 durable handoff 的落点说清楚
  - 当前 `README.md` / `AGENTS.md` / `CLAUDE.md` 已能回答“是什么 / 怎么跑 / 怎么验证”的大部分问题，但缺统一 progress surface
  - 当前 repo 根不存在 `PROGRESS.md` / `STATUS.md` / `ARCHITECTURE.md`
  - 当前动态状态真相已经存在于 `harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json`
- Fallback Reason: not-needed

## Context7 / Documentation Attempt
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 本轮不涉及外部库引入或版本行为变化
- Fallback Reason: not-needed

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- 当前没有会改变路径的关键未知项；实现阶段主要风险是文案过度承诺自动 memory write

## Decisions Required

- `PROGRESS.md` 只作为静态阶段快照与入口
- `harness/ACTIVE_CHANGE` + `harness/changes/*/state.json` 继续作为动态真相
- `status` 作为新的 top-level runtime CLI 子命令，而不是扩展 `lifecycle.mjs`

## Confidence

high
