# Tooling Evidence

## codegraph

- Status: used
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `harness plugin runtime cli.mjs install.mjs update.mjs upgrade.mjs migrate.mjs release-local.mjs verify.mjs upstream-check.mjs context7.mjs help usage argv process.cwd external cwd`
- Key Findings:
  - `package.json` 已声明 `bin.enterprise-harness = bin/enterprise-harness.mjs`
  - `bin/enterprise-harness.mjs` 当前是薄包装到 `harness/plugin/runtime/cli.mjs`
  - runtime installability 的真实入口已存在，但 README 首页仍主要强调 clone + direct CLI path
- Fallback Reason: none

## Context7

- Status: not-needed
- Library Name: n/a
- Resolved Library ID: n/a
- Version: n/a
- Query: n/a
- Key Findings:
  - 当前问题主要是仓库内 installability wording / bin surface，不是外部库版本行为
- Fallback Reason: repo code facts already sufficient

## Vendor / Official Docs

- Source: GitHub code search (`gh search code`)
- Version / Snapshot: current public search at session time
- Query: `enterprise-harness claude plugin manifest install`
- Key Findings:
  - 未获取到足以直接复用的更优安装文案模板；本轮以当前仓库事实为主整理 README / 安装教程
