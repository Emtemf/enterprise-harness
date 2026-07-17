# Exploration

## Topic

gate hardening semantics for issue #11

## Date

2026-07-14

## Request Shape

- modify

## Candidate Tier

- L3

## Owning Module / Domain / Service

- `.claude/rules/`
- `harness/specs/`
- `harness/plugin/runtime/`
- workflow gate / validation / reviewer consumption

## Codegraph Attempt
- Status: success
- Queries:
  - `How are designApproved, redVerified, validation freshness, and reviewer verdicts currently enforced in this repo? Focus on runtime hooks, gate helpers, verify/checks files, and any explicit gaps around plan/task gates for issue #11.`
- Key Findings:
  - `pre-write` 会阻止 DRAFT active change 修改受治理路径，并消费 `designApproved` / `redVerified`
  - `stop` 会阻止 stale validation 的 `REVIEWED` / `VALIDATED` 状态结束，但不会表达 plan/task gate
  - reviewer verdict 目前只做 schema 校验，不做 runtime state consumption
  - 当前没有 plan gate / task gate 的显式 runtime 动作
- Fallback Reason:

## Context7 / Documentation Attempt
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不需要，本轮是仓库内 gate 语义问题
- Fallback Reason: not-needed

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- plan gate 应是独立 state 还是独立 gate key
- task gate 是否需要 machine-readable artifact，而不只依赖 `tasks.md`
- reviewer verdict 的 blocking 结果应由哪个 runtime 层面消费

## Decisions Required

- durable design 是否先以 rule/spec/documentation 定义，再落 runtime 行为
- 是否在 issue #11 下优先分拆成 design/plan/task gate 与 reviewer/validation consumption 两个实现子阶段

## Confidence

- medium-high：当前 codegraph 证据足以支撑从 intake 进入 durable design
