# Enterprise Harness 安装教程

## 适用范围

当前教程适用于：

- 想在 Claude Code 里像 superpowers 一样通过 plugin marketplace 安装本项目的人
- 想在本地运行这个仓库的人
- 想体验 portable runtime CLI 的人
- 想接入项目共享 contract + 本机 adapter 模式的人

> 当前最推荐主路径已经升级为：**先把当前仓库加成 Claude Code 本地 marketplace，再安装 `enterprise-harness` 插件。**
>
> clone 仓库后直接运行 runtime CLI 仍然可用，但现在是 fallback / development path，而不是唯一主路径。

---

## 1. 前置要求

### 必需

- Node.js **>= 20**
- Claude Code CLI 可用（`claude` 命令存在）
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

### clone 仓库（当前仍需要）

```bash
git clone https://github.com/Emtemf/enterprise-harness.git
cd enterprise-harness
```

如果你的仓库目录名不是 `enterprise-harness`，进入你自己的实际目录即可。

---

## 3. 最推荐路径：像 superpowers 一样通过 Claude plugin marketplace 安装

### 方式 A：在 Claude Code 会话里
逐条输入：

```bash
/plugin marketplace add /absolute/path/to/enterprise-harness
/plugin install enterprise-harness@enterprise-harness
```

### 方式 B：在终端里执行等价命令

```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

### 更新方式
如果后续仓库内容变化，要像 superpowers 那样沿 marketplace/plugin 路径更新：

#### Claude Code 会话里
```bash
/plugin marketplace update enterprise-harness
/plugin update enterprise-harness@enterprise-harness
```

#### 终端等价命令
```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

### 当前已验证到什么程度
本仓库当前已经本地验证通过：

- `claude plugin marketplace add /path/to/enterprise-harness`
- `claude plugin install enterprise-harness@enterprise-harness --scope local`
- `claude plugin list` 能看到 `enterprise-harness@enterprise-harness`
- `claude plugin marketplace update enterprise-harness`
- `claude plugin update enterprise-harness@enterprise-harness --scope local`

> 注意：这表示**本地 marketplace / 本地插件安装与更新路径已可用**。
>
> 这不等于“已经发布到公共 marketplace”或“官方市场可搜索安装”。当前完成的是：**像 superpowers 那样的本地 marketplace 安装/更新体验**。

---

## 4. 认识入口分工

对用户来说，当前仓库只有一个入口：

- `/harness`

其他东西都不是用户前门，而是后台层：

1. **唯一用户入口**：Claude Code 会话中优先从 `/harness` 开始
2. **后台命令**：本机/runtime 场景中使用 `node harness/plugin/runtime/cli.mjs ...`
3. **Hooks 自动门禁**：自动做 SessionStart / 写前 / 写后 / Stop 检查

也就是说：
- `/harness` 是对用户的单一前门
- command 负责后台确定性动作，不是第二个用户入口
- hooks 负责自动校验与阻断

## 5. 后台命令入口（仅在需要低层控制时）

安装 plugin 之后，普通用户不需要记住这些命令；如果你只是按 SOP 使用，直接从 `/harness` 开始即可。

下面这些命令只属于：

- fallback
- troubleshooting
- maintainer / repo operator
- 需要低层控制时的后台动作

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

## 6. 首次 runtime 接入推荐顺序

即使你已经安装了 plugin，仍建议在仓库根目录依次执行一次 runtime 初始化：

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

## 7. fallback：如果你不想走 plugin marketplace

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

## 8. 常见 warning 怎么看

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

## 9. 如果你要开始推动一个 change

当前推荐优先使用新的确定性入口命令：

```bash
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]
```


- scaffold 最小 change 资产
- 准备一个 exploration evidence 骨架
- 设置 `harness/ACTIVE_CHANGE`

我们已经做过一次真实 smoke 示例，结果是：

- `changeId=entry-smoke-demo owner=harness-smoke tier=L1`
- 成功创建 `harness/changes/entry-smoke-demo/`
- 成功创建 `evidence/entry-flow-exploration.md`
- 成功设置 `harness/ACTIVE_CHANGE=entry-smoke-demo`
- 后续 `verify` 仍返回 `OK contract and runtime checks passed.`

如果你更想手动拆开执行，仍可继续使用：

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
