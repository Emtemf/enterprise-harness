# AGENTS

本文件是面向人类贡献者和各类 agent harness 的仓库级协作合同，不是 Claude Code 自动加载规则源。

## 先读

1. `README.md`
2. `AGENTS.md`
3. `docs/README.md`
4. `CLAUDE.md`（仅 Claude Code 运行约束）
5. `harness/specs/README.md`
6. `CONTRIBUTING.md`

## 真相层

- 产品与用户入口：`README.md`、`docs/user/`
- 维护文档：`docs/maintainer/`
- 长期运行合同：`harness/specs/`
- Claude Code plugin assets：`skills/`、`agents/`、`hooks/`
- 机械执行：`runtime/`
- 动态 change：`harness/changes/<id>/state.json`（v6，字段：stage/lifecycle/currentTask）；`harness/ACTIVE_CHANGE` 仅用于 v5 compat

同一规则只能有一个权威来源。用户文档解释行为，不能复制 schema 或 runtime 输出全文。

## 修改与验证

修改 runtime、hooks、installer 或 release：

```bash
npm run prepublish-check
```

至少同时运行与改动直接相关的行为测试。新增 hook 必须：

- 在 `harness/plugin/hooks-manifest.json` 声明。
- 运行 `node bin/generate-hooks.mjs`。
- 指定 fail-open/fail-closed 和性能预算。
- 提供 stdin、exit code、stdout/stderr 行为测试。

新增 runtime command 必须：

- 由 `cli.mjs` 暴露。
- 提供 `--help`。
- 使用 argv 数组和 `shell: false`。
- 提供稳定错误码与恢复动作。
- 覆盖路径逃逸、无效 JSON 和外部命令失败。

新增或修改 spec 必须：

- 说明 status、owner、lastVerified、implementationRefs、testRefs。
- 更新 `harness/specs/README.md`。
- 避免与其他主合同重复。

## 安全边界

- 所有 ID 和相对路径必须经过 `safe-paths.mjs`。
- 不信任 changeId、taskId、runId、reviewerId、topic、inputRef 或 outputRef。
- 不跟随可逃逸目标根目录的 symlink。
- 不用字符串包含关系判断 Bash 探索豁免。
- 不用全局 dirty diff 归因当前 Bash 调用。
- 不静默吞掉关键异常。
- 不运行隐式最新版依赖；CI 和在线工具必须锁定版本。

## 生成文件

不得手工修改：

- `hooks/hooks.json`
- `.claude/settings.json` 中的 harness hook 投影
- 版本 manifest 投影

对应生成命令：

```bash
node bin/generate-hooks.mjs
node bin/sync-version.mjs
```

## 历史与研发资产

- `harness/archive/**` 是冻结历史，不直接修改。
- `harness/changes/**` 只保存活动 change。
- `harness/work/**` 不属于规范或发布资产。
- `docs/internal/**` 是可过期的维护快照。
- 测试 fixture 必须在临时目录创建，不依赖真实 active change。

## PR 要求

- 说明用户可见变化和兼容性。
- 列出行为测试与平台证据。
- 不能把聊天输出当唯一证据。
- 不能在 design、真实 RED、独立 checker 或 fresh validation 缺失时声称完成。
- 不提交 secrets、账户信息、本机 adapter 或 receipt spool。
