# Runtime Onboarding

## 目标

给第一次接入这套 Harness 的安装者一个最短路径，不需要先理解整个仓库。

## 推荐顺序

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

如果你只是安装者，到这里就够了。

如果你要开始推动一个新 change：

```bash
node harness/plugin/runtime/cli.mjs lifecycle scaffold <change-id> <owner> <tier>
node harness/plugin/runtime/cli.mjs lifecycle exploration <change-id> <topic>
node harness/plugin/runtime/cli.mjs lifecycle active <change-id>
```
