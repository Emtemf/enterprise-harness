# Tasks

### Task 1: 新增 AGENTS.md 作为 repo-facing contract，并把它接入 doctor/checks

**Files**
- Create: `/home/wula/IdeaProjects/sdd/AGENTS.md`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/CONTRIBUTING.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/directory-model.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/doctor.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`

**Consumes**
- 当前 `/harness` skill 入口模型
- `CLAUDE.md` 与 `.claude/rules/` 的职责边界
- pi 顶层 `AGENTS.md` 作为 repo-facing contract 的参考模式

**Produces**
- 一个面向人类与 agent 的仓库级协作前门
- `doctor` / `verify` 对 `AGENTS.md` 的 required-file 验证

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
  - Expected failure: 在把 `AGENTS.md` 纳入 required path 但尚未创建时，结构校验失败
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs doctor --json`
- [ ] 运行 task review
