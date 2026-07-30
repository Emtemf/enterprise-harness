---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - bin/install.mjs
  - bin/package.mjs
  - bin/release.mjs
  - .github/workflows/release.yml
testRefs:
  - harness/plugin/runtime/test/installer-transaction-smoke.mjs
  - harness/plugin/runtime/test/artifact-content-smoke.mjs
---

# Distribution and Release Contract

standalone 安装按 inspect、plan、conflict、backup、stage、atomic apply、verify、rollback 执行。默认不覆盖已有根合同、非 harness settings 或同名用户 skill/agent。

目标无 Git HEAD 时安装 BLOCK。evidence policy 从目标 HEAD 初始化。

artifact 使用 allowlist，并产出逐文件 manifest、SHA256 和 SBOM。changes、archive、work、lessons、源 policy、receipts 和本机 adapter 永不发布。

版本单一来源为 `package.json.version`，其他 manifest 由生成器同步。

release 只从 clean 且同步的 main 开始，在临时 worktree 修改版本并完成验收；只 add 版本文件；commit 与 tag 分开 push。
