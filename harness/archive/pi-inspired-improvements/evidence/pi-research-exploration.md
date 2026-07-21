# Exploration

## Topic

pi repository agent / workflow design comparison

## Date

2026-07-14

## Request Shape

- modify

## Candidate Tier

- L3

## Owning Module / Domain / Service

- repo governance
- collaboration entry contract
- release / runtime productization inspiration

## Codegraph Attempt
- Status: not-needed
- Queries:
- Key Findings: 本轮主研究对象是外部公开仓库，不依赖本地 codegraph 作为主要证据
- Fallback Reason: 外部参考研究优先使用 GitHub API / raw docs

## Context7 / Documentation Attempt
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不适用；本轮不是框架/SDK 行为问题
- Fallback Reason: not-needed

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- `AGENTS.md` 长期是否还需要进一步细分到 package / runtime 级别
- source-external release smoke 最终是 runtime script、spec，还是完整发布流程的一部分
- containerization/sandboxing 是单一 spec，还是 runtime docs + examples 的组合

## Decisions Required

- 第一批实现是否优先选 `AGENTS.md`：是
- 其余两类优化是否先登记 issue：是

## Confidence

- medium-high：外部仓库文档与元数据足以支撑 issue 登记和第一批低风险实现
