# Contributing

感谢参与 Enterprise Harness。贡献应保持 Claude Code plugin、本仓库开发通道和发布 artifact 的行为一致。

## 环境

- Git
- Node.js 20 或 22
- Claude Code CLI（plugin validation）
- CodeGraph 0.9.9
- Java 21 和 Maven/Maven Wrapper（Java fixture）

## 仓库结构

- `.claude/skills/`：阶段过程
- `.claude/agents/`：agent 身份和工具权限
- `.claude/rules/`：短小的自动约束
- `harness/specs/`：长期合同
- `harness/plugin/runtime/`：确定性 backend 和 hooks
- `harness/templates/`：安装时可复制模板
- `docs/user/`：普通用户
- `docs/maintainer/`：维护者
- `test` 和 `harness/plugin/runtime/test/`：行为验收

## 开发流程

1. 从 active change 或新 change 开始。
2. 先写能证明缺陷的行为测试。
3. 修改最小实现。
4. 运行直接测试。
5. 运行 P0 aggregate 和 prepublish。
6. 更新唯一权威合同和用户可见文档。

## Runtime command

新增命令时：

- 在 `harness/plugin/runtime/cli.mjs` 注册。
- 提供稳定参数、`--help`、exit code 和 JSON 输出。
- 外部进程使用 argv 数组，不拼 shell。
- 写入使用临时文件加原子 rename。
- 对用户输入使用 `safe-paths.mjs`。
- 增加 unit、integration 和 adversarial 测试。

## Hook

只修改 `harness/plugin/hooks-manifest.json`，再运行：

```bash
node bin/generate-hooks.mjs
node bin/generate-hooks.mjs --check
```

hook 必须声明性能预算和 fail mode。PreToolUse 只做最小快照和前置 gate；PostToolUse 只归因当前调用；全仓 verify 在阶段结束单独执行。

## Spec

只有跨实现、长期稳定、需要多方遵守的内容才进入 `harness/specs/`。实现说明、路线图、发布宣传和历史决策分别进入 maintainer docs、Issues、marketing 或 ADR。

每份现行 spec 需要：

```yaml
status: current
owner: maintainers
lastVerified: YYYY-MM-DD
implementationRefs: []
testRefs: []
```

## 测试

直接验收：

```bash
node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs verify
node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs verify
node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs verify
node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify
```

完整验收：

```bash
npm run prepublish-check
```

测试应验证行为、文件系统结果、exit code 和结构化 evidence。不要用源码字符串存在或无条件 `process.exit(1)` 代替真实 RED。

## Packaging

```bash
node bin/package.mjs --out dist
node harness/plugin/runtime/test/artifact-content-smoke.mjs verify
```

artifact 必须排除 changes、archive、work、lessons、源仓库 evidence policy、runtime tests 和本地 adapter。

## PR checklist

- [ ] 变更范围清楚且没有无关文件。
- [ ] 新行为有真实测试。
- [ ] 路径、symlink、Windows 大小写和无效输入已考虑。
- [ ] hooks/settings 和版本投影由生成器更新。
- [ ] 文档没有复制第二份 schema 或 runtime 输出。
- [ ] artifact 内容已解包验证。
- [ ] 没有 secrets、账户、容量或本机状态检查。

## Release 禁止事项

- 不从 dirty worktree 发布。
- 不使用 `git add -A`。
- 不用一次 push 同时推 main 和全部 tags。
- 不在版本写入前做唯一一次验收。
- 不发布未解包验证或版本与 tag 不一致的 artifact。
