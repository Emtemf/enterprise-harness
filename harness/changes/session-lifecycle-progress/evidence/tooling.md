# Tooling Evidence

## codegraph

- Status: ready
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `session start hook stop hook memory progress active change runtime verify start-change repo entry current status docs and hooks for enterprise harness`
  - `runtime verify doctor status-like smoke tests hook tests scripts patterns in harness/plugin/runtime and hooks`
- Key Findings:
  - Node `SessionStart` hook 当前只检查 `.claude/` / `harness/` 关键目录并打印 `/harness` 与 `start-change` 入口
  - Node `Stop` hook 当前只拦 `validation.md` 缺失与 stale validation，不负责 handoff / memory 指引
  - 当前 runtime CLI 还没有 `status` 子命令
  - 当前 repo 根没有统一的 `PROGRESS.md` 进度面
- Fallback Reason: not-needed

## Context7

- Status: not-needed
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 当前变更不涉及新的外部库或版本敏感框架行为
- Fallback Reason: not-needed

## Vendor / Official Docs

- Source:
- Version / Snapshot:
- Query:
- Key Findings: 不适用
