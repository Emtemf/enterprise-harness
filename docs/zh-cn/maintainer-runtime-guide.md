# Enterprise Harness 维护 / 排障指南

> 这份文档只给 maintainer / operator / 排障者看。
>
> 普通用户请返回安装教程，并直接按 `/harness` 使用：
>
> - [`installation-guide.md`](./installation-guide.md)

## 1. 什么时候需要看这份文档

只有当你需要以下低层控制时，才需要继续阅读：

- runtime 初始化
- 本机 adapter 写入与诊断
- `doctor` / `sync` / `verify` / `upstream-check`
- `start-change` / `lifecycle`
- 本机 warning 排查
- fallback / development path

普通用户不需要先理解这些内容。

---

## 2. 维护 / 排障入口

### 方式 A：direct runtime CLI

```bash
node harness/plugin/runtime/cli.mjs <command>
```

### 方式 B：仓库 bin 入口

```bash
node bin/enterprise-harness.mjs <command>
```

### 方式 C：npm scripts

```bash
npm run <script>
```

例如：

```bash
npm run bootstrap
npm run doctor
npm run sync
npm run verify
```

---

## 3. 首次 runtime 接入推荐顺序

即使你已经安装了 plugin，若你要维护 runtime 或排障，仍建议在仓库根目录依次执行一次 runtime 初始化：

### 第 1 步：bootstrap

```bash
node harness/plugin/runtime/cli.mjs bootstrap
```

它会：

- 输出当前仓库位置
- 告诉你本机 local adapter 的默认路径
- 写入一个 `.bootstrap-ran` marker
- 提醒后续继续跑 `doctor`

### 第 2 步：写出本机 local adapter

```bash
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
```

它会把 `local-adapter.example.json` 合并/写出到本机默认路径。

默认路径规则：

- 若设置了 `HARNESS_LOCAL_ADAPTER`，优先使用该路径
- Windows：`%APPDATA%/enterprise-harness/local-adapter.json`
- Linux / macOS：`${XDG_CONFIG_HOME:-~/.config}/enterprise-harness/local-adapter.json`

### 第 3 步：doctor

```bash
node harness/plugin/runtime/cli.mjs doctor
```

如果你需要机器可读输出：

```bash
node harness/plugin/runtime/cli.mjs doctor --json
```

### 第 4 步：sync

```bash
node harness/plugin/runtime/cli.mjs sync
```

如果你需要机器可读输出：

```bash
node harness/plugin/runtime/cli.mjs sync --json
```

### 第 5 步：verify

```bash
node harness/plugin/runtime/cli.mjs verify
```

`verify` 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。

### 第 6 步：upstream-check

```bash
node harness/plugin/runtime/cli.mjs upstream-check
```

---

## 4. fallback：如果你不想走 plugin marketplace

仍然可以直接用仓库路径：

```bash
node harness/plugin/runtime/cli.mjs bootstrap
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs sync
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs upstream-check
```

或者：

```bash
node bin/enterprise-harness.mjs <command>
```

---

## 5. 常见 warning 怎么看

### `context7-env`
表示没有设置 `CONTEXT7_API_KEY`。

当前阶段：

- 这是 **warning**，不是 hard fail
- 仍可尝试通过 CLI wrapper 查询
- 但稳定性依赖本机网络和匿名访问能力

### `local-adapter`
表示本机 adapter 不存在或字段不完整。

优先执行：

```bash
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs migrate --write
```

### `codegraph`
表示本机没有 `codegraph`，或项目没有完成 `.codegraph/` 初始化。

优先执行：

```bash
codegraph init
node harness/plugin/runtime/cli.mjs doctor
```

---

## 6. 如果你要开始推动一个 change

当前推荐优先使用新的确定性入口命令：

```bash
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]
```

它会：

- scaffold 最小 change 资产
- 准备一个 exploration evidence 骨架
- 设置 `harness/ACTIVE_CHANGE`

如果你更想手动拆开执行，仍可继续使用：

```bash
node harness/plugin/runtime/cli.mjs lifecycle scaffold <change-id> <owner> <tier>
node harness/plugin/runtime/cli.mjs lifecycle exploration <change-id> <topic>
node harness/plugin/runtime/cli.mjs lifecycle active <change-id>
```

---

## 7. 平台说明

当前状态最准确的说法是：

- Linux / macOS / Windows 的 GitHub Actions smoke matrix 已跑通
- 当前 runtime 入口已经统一到 Node CLI
- 更广泛的本地开发机、团队真实环境、权限与代理差异，仍应视为后续持续验证范围

---

## 8. 相关文档

- [项目概览](./overview.md)
- [安装教程](./installation-guide.md)
- `harness/plugin/runtime/ONBOARDING.md`
- `harness/specs/local-runtime-adapter.md`
