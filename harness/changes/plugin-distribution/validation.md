# Validation

## Source Digest

- Validation scope: plugin-distribution — GitHub Release 分发 + 安装脚本 + 一键 release
- 包含：install.mjs、package.mjs、release.mjs、release.yml、package.json scripts、README 安装说明

## Artifact Digest

- change: `harness/changes/plugin-distribution/change.md`
- design: `harness/changes/plugin-distribution/design.md`
- tasks: `harness/changes/plugin-distribution/tasks.md`
- 新增脚本：
  - `bin/install.mjs`
  - `bin/package.mjs`
  - `bin/release.mjs`
- 新增 workflow: `.github/workflows/release.yml`
- 新增 smoke:
  - `harness/plugin/runtime/test/install-contract-smoke.mjs`
  - `harness/plugin/runtime/test/package-contract-smoke.mjs`
  - `harness/plugin/runtime/test/release-workflow-smoke.mjs`

## Commands Executed

1. `node harness/plugin/runtime/test/install-contract-smoke.mjs red` → RED 成立
2. `node harness/plugin/runtime/test/install-contract-smoke.mjs green` → passed
3. `node harness/plugin/runtime/test/install-contract-smoke.mjs verify` → passed
4. `node harness/plugin/runtime/test/package-contract-smoke.mjs red` → RED 成立
5. `node harness/plugin/runtime/test/package-contract-smoke.mjs green` → passed
6. `node harness/plugin/runtime/test/package-contract-smoke.mjs verify` → passed
7. `node harness/plugin/runtime/test/release-workflow-smoke.mjs red` → RED 成立
8. `node harness/plugin/runtime/test/release-workflow-smoke.mjs green` → passed
9. `node harness/plugin/runtime/test/release-workflow-smoke.mjs verify` → passed
10. `cli verify` → OK contract checks passed
11. `cli doctor` → 16 OK
12. 全量 smoke → PASS=52 FAIL=0
13. `node bin/release.mjs --dry-run` → 正确显示 version bump 与步骤

## Skipped Checks

1. **design-reviewer 子代理正式 verdict**
   - 原因：子代理因 harness hook 干扰（settings.json pattern 拦截）无法输出 verdict
   - 替代：inline 预审，已核实 design 事实声明并修正（.github/workflows/ 已有 platform-smoke.yml）

2. **实际 GitHub Release 发布**
   - 原因：需要手动触发 `npm run release`，会推送 tag 并触发 Actions
   - 恢复条件：维护者手动执行

## Final Verdict

核心功能已实现并验证：install/package/release 三脚本 + GitHub Actions + README 安装说明。
验证证据 fresh，52 smoke 全绿，可以归档。
