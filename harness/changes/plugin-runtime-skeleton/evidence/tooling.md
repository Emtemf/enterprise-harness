# Tooling Evidence

## codegraph

- Status: ready
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `codegraph status`
- Key Findings:
  - `.codegraph/` 已初始化
  - Index up to date
  - Doctor 中可作为 runtime health check 的真实依赖
- Fallback Reason: 无

## Context7

- Status: usable-via-cli
- Library Name: React（用于 runtime 自检）
- Resolved Library ID: `/react/react`
- Version: CLI 查询快照
- Query: `useEffect examples`
- Key Findings:
  - `ctx7 docs` 在当前机器上可返回真实文档内容
  - 因此 doctor 可把 Context7 作为 runtime capability 检查的一部分
- Fallback Reason: project `.mcp.json` 不再把 Context7 作为当前阶段主路径

## Vendor / Official Docs

- Source: 本仓库 `harness/specs/plugin-runtime.md` 与 `harness/specs/local-runtime-adapter.md`
- Version / Snapshot: 2026-07-13
- Query: runtime layering / local adapter / sync
- Key Findings:
  - repo contract 与 local adapter 已被分层表达
  - 运行层命令已形成 `bootstrap` / `doctor` / `sync` 三件套
