# Runtime Onboarding

## 这份文档给谁看

这份文档是 **maintainer / operator / 排障者附录**，不是普通用户的第一入口。

如果你是普通用户：

1. 获取仓库
2. 通过 Claude Code 本地 marketplace 安装 `enterprise-harness`
3. 进入 Claude Code 会话后直接从 `/harness` 开始

优先阅读：

- `README.md`
- `docs/zh-cn/installation-guide.md`

只有当你需要维护 runtime、排查本机问题、或做低层控制时，才继续阅读本文件。

## 目标

给维护者和排障者一个最短的 runtime 低层操作路径，而不是让普通用户先理解整个仓库。

## 推荐顺序（维护 / 排障场景）

### 1. 进入仓库根目录
```bash
cd enterprise-harness
```

### 2. 初始化 runtime
```bash
node harness/plugin/runtime/cli.mjs bootstrap
```

### 3. 写出本机 adapter
```bash
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
```

### 4. 做本机自检
```bash
node harness/plugin/runtime/cli.mjs doctor
```

### 5. 做同步检查
```bash
node harness/plugin/runtime/cli.mjs sync
```

### 6. 查看上游状态
```bash
node harness/plugin/runtime/cli.mjs upstream-check
```

## 如果出现 warning

### `context7-env`
说明当前没设置 `CONTEXT7_API_KEY`。当前阶段不是 hard fail；你仍可尝试 Context7 CLI 查询，但稳定性依赖本机网络与匿名访问能力。

### `local-adapter`
说明本机 adapter 缺失或字段不完整。优先运行：

```bash
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs migrate --write
```

### `codegraph`
说明本机没有安装 `codegraph` 或项目还没初始化 `.codegraph/`。优先补：

```bash
codegraph init
node harness/plugin/runtime/cli.mjs doctor
```

## 下一步

如果你只是普通用户，到这里不需要继续；直接回到 Claude Code 会话，并从 `/harness` 开始。

如果你是维护者并要推动一个新 change：

```bash
node harness/plugin/runtime/cli.mjs lifecycle scaffold <change-id> <owner> <tier>
node harness/plugin/runtime/cli.mjs lifecycle exploration <change-id> <topic>
node harness/plugin/runtime/cli.mjs lifecycle active <change-id>
```
