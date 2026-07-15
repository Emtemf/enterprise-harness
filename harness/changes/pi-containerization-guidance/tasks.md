# Tasks

### Task 1: 新增 containerization / sandboxing 指南并把它接入 repo-facing 文档与校验

**Files**
- Create: `/home/wula/IdeaProjects/sdd/harness/specs/containerization-sandboxing.md`
- Modify: `/home/wula/IdeaProjects/sdd/README.md`
- Modify: `/home/wula/IdeaProjects/sdd/CONTRIBUTING.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/specs/directory-model.md`
- Modify: `/home/wula/IdeaProjects/sdd/harness/plugin/runtime/lib/checks.mjs`

**Consumes**
- 当前 local adapter / plugin runtime 文档
- pi 的 containerization 文档方法参考

**Produces**
- 稳定的容器化/沙箱化指南
- repo-facing 文档入口
- `verify` 的 required spec 校验

- [ ] 写失败测试
- [ ] 运行 RED 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
  - Expected failure: 在把新 spec 纳入 required path 但文件尚未创建时，结构校验失败
- [ ] 实现最小 GREEN 改动
- [ ] 运行 GREEN 命令
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 在全绿状态下重构
- [ ] 运行定向验证
  - Command: `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify`
- [ ] 运行 task review
