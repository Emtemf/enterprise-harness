# Tooling Evidence

## codegraph

- Status: available
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `How are release/prepublish/runtime command surfaces wired in this repo? Focus on package.json scripts, harness/plugin/runtime/cli.mjs, prepublish.mjs, release-readiness.md, and plugin-runtime.md to design a source-external local release smoke command and related docs.`
- Key Findings:
  - 当前 `prepublish` 聚合 `doctor` / `sync` / `verify` / `upstream-check`
  - runtime CLI 已有统一 command façade，适合新增 `release-local`
  - 当前 release-readiness 仍主要围绕 repo 内验证，没有 source-external smoke 入口
- Fallback Reason: 无

## Context7

- Status: not-needed
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不适用；本轮不是框架/SDK 行为问题
- Fallback Reason: not-needed

## Vendor / Official Docs

- Source: `https://github.com/earendil-works/pi`
- Version / Snapshot: `main` branch public snapshot
- Query: `README.md`, root `package.json`
- Key Findings:
  - pi 暴露了 `release:local`，强调在源码树外验证发布路径
  - 这类 source-external smoke 对“可发布/可安装”说法的可信度提升明显
