# Tooling Evidence

## codegraph

- Status: not-needed
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
- Key Findings: 当前变更主要是文档/contract 补齐，不依赖本地代码图进行影响分析
- Fallback Reason: not-needed

## Context7

- Status: not-needed
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不适用
- Fallback Reason: not-needed

## Vendor / Official Docs

- Source: `https://github.com/earendil-works/pi`
- Version / Snapshot: `main` branch public snapshot
- Query: `packages/coding-agent/docs/containerization.md`
- Key Findings:
  - pi 明确区分宿主机运行、整个进程容器化、以及工具路由到隔离环境三种模式
  - pi 会把 secrets / host auth / mounted workspace 的边界写清楚，而不是留在隐式知识里
