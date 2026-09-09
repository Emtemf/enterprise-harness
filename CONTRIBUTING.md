# Contributing

感谢参与 Enterprise Harness。贡献应保持 Claude Code plugin、本仓库开发通道和发布 artifact 的行为一致。

## 环境

- Git
- Node.js 20 或 22
- Claude Code CLI（plugin validation）
- CodeGraph 0.9.9
- Java 21 和 Maven/Maven Wrapper（Java fixture）

## 仓库结构

- `harness/specs/`：长期合同
- `skills/`：阶段过程
- `agents/`：agent 身份和工具权限
- `hooks/`：Claude Code host-boundary 适配
- `runtime/`：确定性 backend 和 hooks
- `harness/templates/`：安装时可复制模板
- `docs/user/`：普通用户
- `docs/maintainer/`：维护者
- `test` 和 `runtime/test/`：行为验收

## 开发流程

用户可见行为遵循契约先行；详细责任边界见[文档治理](docs/maintainer/documentation-governance.md)。

1. 用 issue、失败样本或现有行为证据定义问题，不把方案当问题。
2. 先更新产品承诺与适用边界、现行 Spec/ADR、`harness/capabilities.json` 和验收条件。
3. 写出能证明缺陷或缺失能力的 RED 行为测试，并实际看到预期失败。
4. 修改最小实现，使直接测试转为 GREEN。
5. 在同一 change 内刷新 README、用户手册、维护投影、故障恢复和生成型 CLI reference。
6. 运行 `npm run docs:check`、直接行为测试、P0 aggregate 和 prepublish。
7. 独立检查用户承诺、Spec、实现、测试和文档投影的追踪关系后再合并或发布。

纯内部重构可以不改变产品承诺，但必须由行为测试证明等价；不能先扩大实现，再用 README 为既成事实补授权。

## Runtime command

新增命令时：

- 在 `runtime/cli.mjs` 注册。
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

## Capability trace

`harness/capabilities.json` 只列当前可发布能力。新增或改变一项产品承诺时，必须同时提供：

- 中文 `productClaim`；
- `specRefs`；
- `implementationRefs`；
- `testRefs`；
- `userDocRefs`；
- `maintainerDocRefs`。

`npm run docs:check` 会检查 ID、真相层、引用完整性和 README 核心定位。只有未来目标、没有实现或验收证据的内容不得进入 capability registry。

## 测试

直接验收：

```bash
node runtime/test/task1-authoritative-evidence-smoke.mjs verify
node runtime/test/task2-plugin-agent-smoke.mjs verify
node runtime/test/task3-gate-completion-smoke.mjs verify
node runtime/test/task4-release-acceptance-smoke.mjs verify
```

完整验收：

```bash
npm run quality:local
```

`quality:local` 在本机依次执行 prepublish、external-project E2E、确定性打包、SBOM、release notes 和解包验收。GitHub Actions 的平台与安全 workflow 只允许维护者按需手动触发，不是日常 push gate。

测试应验证行为、文件系统结果、exit code 和结构化 evidence。不要用源码字符串存在或无条件 `process.exit(1)` 代替真实 RED。

## Packaging

```bash
node bin/package.mjs --out dist
node runtime/test/artifact-content-smoke.mjs verify
```

artifact 必须排除 changes、archive、work、lessons、源仓库 evidence policy、runtime tests 和本地 adapter。

## PR checklist

- [ ] 变更范围清楚且没有无关文件。
- [ ] 用户承诺、适用边界和 Spec 在 implementation 之前明确。
- [ ] capability trace 已绑定 Spec、实现、测试、用户文档和维护文档。
- [ ] 新行为有真实测试。
- [ ] 路径、symlink、Windows 大小写和无效输入已考虑。
- [ ] hooks/settings 和版本投影由生成器更新。
- [ ] 文档没有复制第二份 schema 或 runtime 输出。
- [ ] README/用户手册没有把目标、单次 pilot 或未证明 ROI 写成当前事实。
- [ ] artifact 内容已解包验证。
- [ ] 没有 secrets、账户、容量或本机状态检查。

## Release 禁止事项

- 不从 dirty worktree 发布。
- 不使用 `git add -A`。
- 不用一次 push 同时推 main 和全部 tags。
- 不在版本写入前做唯一一次验收。
- 不发布未解包验证或版本与 tag 不一致的 artifact。
