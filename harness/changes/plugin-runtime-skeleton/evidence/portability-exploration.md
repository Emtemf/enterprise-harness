# Exploration

## Topic

plugin-runtime portability

## Date

2026-07-13

## Request Shape

new

## Candidate Tier

L2

## Owning Module / Domain / Service

- service: harness-governance
- module: `harness/plugin/runtime`
- domain: portable runtime adapter

## Codegraph Attempt
- Status: ready
- Queries:
  - `codegraph status`
- Key Findings:
  - 当前仓库已有 `.claude/` contract、templates、change lifecycle commands
  - 运行层仍需要从 bash-only 过渡到跨平台入口
- Fallback Reason: 无

## Context7 / Documentation Attempt
- Library Name: React（runtime 自检样例）
- Resolved Library ID: `/react/react`
- Version: current query snapshot
- Query: `useEffect examples`
- Key Findings:
  - CLI runtime path 可用
- Fallback Reason: 无

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- Windows / macOS 真机运行结果尚未验证
- installer / upgrade 机制尚未实现

## Decisions Required

- 当前阶段选 Node runtime 作为跨平台实现层
- 当前阶段保留 shell 过渡实现，不立即删除

## Confidence

中高。当前足以支撑 runtime skeleton 落地，但不足以宣称全平台生产可用。
