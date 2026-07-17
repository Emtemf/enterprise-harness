# Draft Tasks (Pending Design Approval)

Status: draft-plan

## Preconditions
- clarify-ready: true
- design-approved:
- plan-critic verdict:
- current active change: `runtime-installability-polish`

### Task 1: 补最小 Claude plugin / marketplace 发布资产

**Files**
- Create: `/home/wula/IdeaProjects/sdd/.claude-plugin/plugin.json`
- Create: `/home/wula/IdeaProjects/sdd/.claude-plugin/marketplace.json`
- Create: `/home/wula/IdeaProjects/sdd/hooks/hooks.json`
- Modify: `/home/wula/IdeaProjects/sdd/package.json`
- Modify: `/home/wula/IdeaProjects/sdd/bin/enterprise-harness.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/manifest.json`
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs`

**Consumes**
- 当前 runtime CLI / bin 入口
- 当前 `.claude/skills/`、`.claude/agents/`、runtime hooks
- 当前本机 `claude plugin` / marketplace 能力

**Produces**
- 最小 plugin.json
- 最小 marketplace.json
- plugin-mode hooks payload
- 本地 marketplace 安装 smoke

**Implementation Order**
1. 先补 `.claude-plugin/plugin.json`
2. 再补 `.claude-plugin/marketplace.json`
3. 再补 `hooks/hooks.json`
4. 视需要调 bin / package / manifest 对齐
5. 最后写 smoke

**Test-first Order**
1. 先让 `claude plugin validate` / install smoke 在当前仓库失败
2. 再补最小资产让其转绿

**RED Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs red`
- Expected failure: 当前仓库缺少 `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` / plugin-mode hooks payload，导致 `claude plugin validate` 或 marketplace install contract 不满足

**GREEN Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs green`
- Expected success: plugin / marketplace validate 通过，且本地 marketplace install/list/update contract 至少达到最小可用

**Refactor Boundary**
- 仅在全绿后允许整理 manifest 文案与 command surface 命名

**Acceptance Checks**
- [ ] `claude plugin validate .claude-plugin/plugin.json` 通过
- [ ] `claude plugin validate .claude-plugin/marketplace.json` 通过
- [ ] `claude plugin marketplace add <repo>` 可识别该仓库为 marketplace
- [ ] `claude plugin install enterprise-harness@enterprise-harness` 至少在本地 scope 路径上可消费

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task1.json`

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review

### Task 2: 把 README / 安装文档改成 plugin-first 口径

**Files**
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/docs/zh-cn/installation-guide.md`
- Modify: `/home/wula/IdeaProjects/sdd/docs/zh-cn/overview.md`
- Modify: `/home/wula/IdeaProjects/sdd/AGENTS.md`

**Consumes**
- Task 1 的真实 plugin / marketplace surface
- 当前 clone path / bin path / plugin path 三种入口

**Produces**
- plugin-first README
- 安装方式矩阵
- 不夸大能力的更新说明

**Implementation Order**
1. 先改 README Quick Start
2. 再改安装教程
3. 再改 overview / AGENTS

**Test-first Order**
1. 先固定精确字符串断言
2. 再对齐文档

**RED Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs red`
- Expected failure: 当前 README/安装教程仍主要强调 clone path，且没有把 plugin marketplace 安装列为第一等入口

**GREEN Evidence Point**
- Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs green`
- Expected success: README / installation-guide / overview / AGENTS 都对齐 plugin-first 安装口径，并明确保留 clone fallback

**Refactor Boundary**
- 仅在文档断言全绿后整理措辞，不得删掉 fallback 路径

**Acceptance Checks**
- [ ] README 明确写出 `/plugin marketplace add ...` 与 `/plugin install ...` 路径
- [ ] README 明确区分 plugin install、bin install、clone fallback
- [ ] 安装教程说明 update 路径（marketplace update / plugin update）
- [ ] overview / AGENTS 不再把项目描述成“还不是插件”

**Review Target**
- Reviewer: `verification-reviewer`
- Output: `/home/wula/IdeaProjects/sdd/harness/changes/runtime-installability-polish/reviews/verification-reviewer-task2.json`

- [ ] 写失败测试
- [ ] 运行 RED 命令
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
- [ ] 运行 task review
