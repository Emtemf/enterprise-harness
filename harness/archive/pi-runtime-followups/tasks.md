# Tasks

### Task 1: 新增 source-external local release smoke 命令并接入 runtime / docs

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/release-local.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs`
- Modify: `/home/wula/IdeaProjects/sdd/package.json`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/manifest.json`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/release-readiness.md`

**Consumes**
- 当前 `doctor` / `sync` / `verify` / `upstream-check` 命令面
- pi 的 `release:local` 设计灵感

**Produces**
- `release-local` 命令
- source-external 本地 smoke 路径
- release readiness 文档同步

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs release-local`
  - Expected failure: 在命令未接入前，CLI 报 unknown command 或对应脚本缺失
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs release-local`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs doctor --json`
- [ ] 运行 task review
