# Exploration

## Topic

pi-inspired runtime productization follow-up

## Date

2026-07-14

## Request Shape

- modify

## Candidate Tier

- L3

## Owning Module / Domain / Service

- `harness/plugin/runtime/`
- `package.json`
- `harness/specs/release-readiness.md`

## Codegraph Attempt
- Status: success
- Queries:
  - `How are release/prepublish/runtime command surfaces wired in this repo? Focus on package.json scripts, harness/plugin/runtime/cli.mjs, prepublish.mjs, release-readiness.md, and plugin-runtime.md to design a source-external local release smoke command and related docs.`
- Key Findings:
  - 当前 runtime CLI 很适合作为 `release-local` 的统一入口
  - 当前 prepublish 仍是 repo 内验证，不覆盖 source-external 使用路径
- Fallback Reason:

## Context7 / Documentation Attempt
- Library Name:
- Resolved Library ID:
- Version:
- Query:
- Key Findings: 不适用
- Fallback Reason: not-needed

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- source-external smoke 后续是否还需要额外打包/压缩产物验证
- 是否把 registry 安装 smoke 也放进同一命令，还是另开 issue

## Decisions Required

- 当前先实现 repo-external 临时目录 smoke，不等待完整发布系统

## Confidence

- medium-high
