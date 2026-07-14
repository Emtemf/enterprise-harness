# Enterprise Harness 安装教程

## 适用范围

当前教程适用于：

- 想在本地运行这个仓库的人
- 想体验 portable runtime CLI 的人
- 想接入项目共享 contract + 本机 adapter 模式的人

> 当前主路径仍是：**clone 仓库后在仓库根目录执行 runtime CLI**。
>
> 仓库里虽然已经有 `package.json` 和 `bin/enterprise-harness.mjs`，但当前并没有把“公开 registry 一键安装”作为默认已完成能力来宣称。

---

## 1. 前置要求

### 必需

- Node.js **>= 20**
- 能进入本仓库根目录

### 推荐

- `codegraph` 命令可用
- `npx` 可用
- 网络允许访问 `npx ctx7`

### 当前版本事实

- `package.json` 当前要求 `node >= 20`
- GitHub Actions `platform-smoke` 当前使用 Node 22 进行 Linux / macOS / Windows smoke test
- `CodeGraph` 当前记录的验证版本为 `0.9.9`
- `Context7` 当前记录的验证版本为 `0.5.4`

---

## 2. 获取项目

### 方式 A：clone 仓库（当前推荐）

```bash
git clone https://github.com/Emtemf/enterprise-harness.git
cd enterprise-harness
```

如果你的仓库目录名不是 `enterprise-harness`，进入你自己的实际目录即可。

---

## 3. 认识统一命令入口

当前统一入口有两种写法：

### 方式 A：直接调用 runtime CLI

```bash
node harness/plugin/runtime/cli.mjs <command>
```

### 方式 B：走仓库 bin 入口

```bash
node bin/enterprise-harness.mjs <command>
```

### 方式 C：走 npm scripts

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

> 当前最稳定、最明确的口径仍建议优先使用 **方式 A**。

---

## 4. 首次接入推荐顺序

在仓库根目录依次执行：

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

它会检查：

- `CLAUDE.md`
- `.claude/settings.json`
- `harness/config.yaml`
- `harness/specs/plugin-runtime.md`
- `codegraph` 可用性
- `ctx7` CLI 运行情况
- 本机 local adapter 是否存在且字段完整
- `harness/ACTIVE_CHANGE` 是否存在（warning 级别）

如果你需要机器可读输出：

```bash
node harness/plugin/runtime/cli.mjs doctor --json
```

### 第 4 步：sync

```bash
node harness/plugin/runtime/cli.mjs sync
```

它会检查：

- manifest 是否可读
- bootstrap 是否已运行
- local adapter example 是否存在
- 本机 adapter 是否存在 / 是否缺字段
- `CONTEXT7_API_KEY` 是否已设置（当前允许 warning）

如果你需要机器可读输出：

```bash
node harness/plugin/runtime/cli.mjs sync --json
```

### 第 5 步：verify

```bash
node harness/plugin/runtime/cli.mjs verify
```

它会做当前最小 contract / runtime 自检：

- 结构检查
- OpenAPI 轻检查
- controller consistency 检查
- change artifact 状态检查
- review verdict 检查
- evidence 检查
- template 中 `TODO` / `TBD` 占位检查

### 第 6 步：upstream-check

```bash
node harness/plugin/runtime/cli.mjs upstream-check
```

它会盘点：

- CodeGraph 当前版本
- Context7 当前版本
- reference-only upstream（如 Superpowers / OpenSpec）

---

## 5. 一条最短安装路径

如果你只想快速接入并确认本机能跑，最短命令集是：

```bash
node harness/plugin/runtime/cli.mjs bootstrap
node harness/plugin/runtime/cli.mjs setup-local-adapter --write
node harness/plugin/runtime/cli.mjs doctor
node harness/plugin/runtime/cli.mjs sync
node harness/plugin/runtime/cli.mjs verify
node harness/plugin/runtime/cli.mjs upstream-check
```

---

## 6. 常见 warning 怎么看

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

## 7. 如果你要开始推动一个 change

当前推荐先建立最小 change 资产：

```bash
node harness/plugin/runtime/cli.mjs lifecycle scaffold <change-id> <owner> <tier>
node harness/plugin/runtime/cli.mjs lifecycle exploration <change-id> <topic>
node harness/plugin/runtime/cli.mjs lifecycle active <change-id>
```

然后再按仓库工作流推进：

1. intake
2. discovery
3. route
4. design
5. plan
6. TDD
7. review
8. validation

如果你要改的是 `reference-service/` 的受治理路径，那么写入前还会受到 `active change`、`designApproved`、`redVerified` 等 gate 约束。

---

## 8. 平台说明

当前状态最准确的说法是：

- Linux / macOS / Windows 的 **GitHub Actions smoke matrix 已跑通**
- 当前 runtime 入口已经统一到 Node CLI
- 但更广泛的本地开发机、团队真实环境、权限与代理差异，仍应视为后续持续验证范围

所以可以说“**跨平台骨架已验证**”，但不建议把它表述成“所有本机环境都已经零配置正式支持”。

---

## 9. 安装后先看什么

建议顺序：

1. `README.md`
2. `CLAUDE.md`
3. `docs/zh-cn/overview.md`
4. `harness/specs/plugin-runtime.md`
5. `harness/specs/local-runtime-adapter.md`
6. `harness/specs/platform-validation-matrix.md`

---

## 10. 已知边界

当前不要过度承诺这些能力已经 fully done：

- 完整 installer
- 完整 upgrade / migration UX
- 全量真机开发环境验证
- ArchUnit / JaCoCo / 真 HTTP API E2E
- 完整 OpenAPI 语义门禁

当前最准确的安装结论是：

> 这套项目已经具备统一 runtime CLI、本机 adapter、doctor / sync / verify / upstream-check 和跨平台 smoke matrix，适合作为第一版接入与继续产品化的基础。

---

## 11. 相关文档

- [项目概览](./overview.md)
- [项目公告文案](./announcement.md)
- `harness/plugin/runtime/ONBOARDING.md`
- `harness/specs/local-runtime-adapter.md`
