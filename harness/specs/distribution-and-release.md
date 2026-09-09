---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-09
implementationRefs:
  - bin/package.mjs
  - bin/local-quality.mjs
  - bin/release.mjs
testRefs:
  - runtime/test/artifact-content-smoke.mjs
  - runtime/test/docs-consistency-smoke.mjs
  - runtime/test/release-local-transaction-smoke.mjs
  - runtime/test/release-version-acceptance-smoke.mjs
---

# Distribution and Release Contract

分发只有一条通道：Claude Code plugin marketplace。

artifact 使用 allowlist，并产出逐文件 manifest、SHA256 和 SBOM。changes、archive、work、lessons、源 policy、
研发期 Harness Skill eval、receipts 和本机 adapter 永不发布。

版本单一来源为 `package.json.version`，其他 manifest 由生成器同步。

release 只从 clean 且同步的 main 开始，在临时 worktree 修改版本；完整 tracked diff 必须精确匹配版本 allowlist。版本 commit 后从 clean tree 运行完整本地质量 gate；artifact manifest 的每个输入必须存在于 release commit，且 size/SHA256 与 clean tree 一致，未跟踪文件不能进入上传制品。commit 与 tag 分开 push，并逐一核对远端 ref target。

GitHub repository identity 只能从 `origin` URL 解析。推送 tag 后由本机 `gh release create --verify-tag` 上传 tarball、manifest、SHA256、SBOM 和 release notes，不依赖自动 GitHub Actions。首次远端 main 写入后的失败必须保留 worktree 与制品，并输出可直接执行的 tag/release JSON argv；不能清理唯一恢复材料或要求重新 bump 版本。

用户可见行为采用契约先行：用户承诺、适用边界、现行 Spec、capability trace 和 acceptance test 必须在 implementation 之前冻结；README、用户手册、维护投影和生成型 CLI reference 必须在同一 change 内闭环。发布前 `docs:check` 必须校验 capability 的 Spec、实现、测试、用户文档和维护文档五向引用；缺失任一方向时不能发布。具体文档职责与变更顺序见 `docs/maintainer/documentation-governance.md`。
