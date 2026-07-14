# Tooling Evidence

## codegraph

- Status: not-needed
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
- Key Findings: 本轮主研究对象是外部公开仓库设计，不依赖本地 codegraph 作为第一手来源
- Fallback Reason: 外部参考研究优先使用 GitHub 公开 API 与 raw 文档

## Context7

- Status: not-needed
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不适用；本轮不是库/框架行为验证
- Fallback Reason: not-needed

## Vendor / Official Docs

- Source: `https://github.com/earendil-works/pi`
- Version / Snapshot: `main` branch public snapshot
- Query: `README.md`, `AGENTS.md`, root `package.json`, `packages/coding-agent/docs/containerization.md`
- Key Findings:
  - pi 通过顶层 `AGENTS.md` 明确给人类与 agent 一个 repo-facing contract
  - pi 用 `release:local` 明确 source-external release smoke 路径
  - pi 对 containerization / sandboxing 有稳定文档，不把这部分只留在聊天或隐式知识里
