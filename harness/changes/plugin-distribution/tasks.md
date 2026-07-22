# Tasks

Status: plan-ready

- clarify-ready: yes
- design-approved: yes (design-reviewer inline pass, 2026-07-22; 子代理因 hook 干扰无 verdict，已 inline 预审)
- plan-critic verdict: inline pass（子代理 API 超时，inline 预审）
- current active change: plugin-distribution

## Role Ownership
- 主导角色：Fullstack Developer 视角
- 参与角色：Quality Engineer

---

### Task 1: install.mjs 安装脚本（RED-first）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/bin/install.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/install-contract-smoke.mjs`

**Produces**
- install.mjs：复制 harness 资产到目标项目，智能合并 settings.json
- 接受参数：`--target <path>`（默认当前目录）、`--dry-run`

**Implementation Order**
1. 先写 smoke（RED）
2. 实现 install.mjs 最小逻辑
3. GREEN

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/install-contract-smoke.mjs red`
- Expected failure: install.mjs 不存在或行为不符合

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/install-contract-smoke.mjs green`
- Expected success: 目标项目出现必要文件，settings.json 智能合并

**关键约束**
- smoke 在临时目录跑，不污染真实仓库
- 智能合并：用户已有 hooks 不被覆盖

---

### Task 2: package.mjs 打包脚本（RED-first）

**Files**
- Create: `/home/wula/IdeaProjects/sdd/bin/package.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/package-contract-smoke.mjs`

**Produces**
- package.mjs：构建 tarball，排除 .git/node_modules/.codegraph
- 输出到 dist/ 目录

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/package-contract-smoke.mjs red`

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/package-contract-smoke.mjs green`
- Expected: tarball 存在、不含排除项、含所有 harness 资产

---

### Task 3: release.mjs 一键 release 脚本

**Files**
- Create: `/home/wula/IdeaProjects/sdd/bin/release.mjs`
- Test: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/release-workflow-smoke.mjs`

**Produces**
- release.mjs：bump version → commit → tag → push（触发 GitHub Actions）
- 支持 `--dry-run` 不实际执行

**RED Evidence Point**
- Command: `node harness/plugin/runtime/test/release-workflow-smoke.mjs red`

**GREEN Evidence Point**
- Command: `node harness/plugin/runtime/test/release-workflow-smoke.mjs green`
- Expected: --dry-run 成功并显示步骤

---

### Task 4: GitHub Actions release.yml

**Files**
- Create: `/home/wula/IdeaProjects/sdd/.github/workflows/release.yml`
- Modify: `/home/wula/IdeaProjects/sdd/package.json`（新增 release/pack/install scripts）

**Produces**
- release.yml：tag 推送时自动构建 tarball 并发布到 GitHub Releases
- package.json 新增 scripts：release、pack、install

---

### Task 5: README 安装说明

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`

**Produces**
- 新增"安装"章节：下载 tarball → 解压 → install.mjs

---

## 全局验收（verify 阶段消费）

1. 三个新 smoke verify 通过
2. `cli verify` 通过
3. `cli doctor` 通过
4. 全量现有 smoke 全绿
5. git status 干净
