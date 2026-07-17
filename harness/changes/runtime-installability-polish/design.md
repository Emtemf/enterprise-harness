# Design

## Requirement Alignment

本 change 响应用户的真实目标：不要只停留在“README 像插件”，而是尽量把当前仓库推进到**像 superpowers 一样，可被 Claude Code plugin marketplace 识别、安装与更新**的最低可用形态。

本轮设计聚焦两件事：

1. **把当前仓库补成 Claude Code marketplace/plugin 可识别的最小发布资产**
2. **同步 README / 安装文档，让用户看到的安装方式与真实可用入口一致**

## Current-State Evidence

当前仓库已有但还未串成完整 plugin-marketplace 形态的资产：

- `package.json` 已声明 `bin.enterprise-harness = bin/enterprise-harness.mjs`
- `bin/enterprise-harness.mjs` 已可把命令转发到 `harness/plugin/runtime/cli.mjs`
- `.claude/settings.json` 已显示本机 Claude Code 支持：
  - `claude plugin marketplace add`
  - `claude plugin install`
  - `claude plugin update`
- 当前本机已配置并消费 marketplace：
  - `superpowers-marketplace`
  - `omc`
  - 说明“marketplace + plugin.json + marketplace.json + installed_plugins.json/cache”这条链路在当前环境是真实存在的
- `superpowers-marketplace/.claude-plugin/marketplace.json` 显示 marketplace 通过一个 catalog 暴露多个 plugin
- `omc/.claude-plugin/plugin.json` 显示 plugin 至少可声明：
  - `name`
  - `version`
  - `description`
  - `skills`
  - `commands`
  - `mcpServers`
- `omc/hooks/hooks.json` 显示 plugin 还能声明独立 hooks payload

当前仓库缺口：

- 仓库根没有 `.claude-plugin/plugin.json`
- 仓库根没有 `.claude-plugin/marketplace.json`
- 仓库根没有 plugin-mode `hooks/hooks.json`
- README / 安装教程仍主要强调 clone + direct CLI，而不是 Claude plugin marketplace 安装
- 当前项目技能与 hooks 仍只以 repo-local `.claude/` + runtime hooks 方式存在，未整理成 plugin manifest 可消费的声明路径

## Scope / Non-goals

### Scope

- 新增最小 `.claude-plugin/plugin.json`
- 新增最小 `.claude-plugin/marketplace.json`，让当前仓库本地目录可被 `claude plugin marketplace add <dir>` 识别
- 新增 plugin-mode `hooks/hooks.json`，把现有 runtime hooks 暴露成 plugin 可消费入口
- 更新 README / `docs/zh-cn/installation-guide.md` / `docs/zh-cn/overview.md`
- 视需要微调 `bin/enterprise-harness.mjs` / `package.json` / `harness/plugin/manifest.json` 文案，使 plugin install surface 与 runtime CLI 一致

### Non-goals

- 不在本轮承诺已发布到公共 marketplace
- 不在本轮承诺官方市场收录
- 不在本轮改变 runtime contract 语义
- 不在本轮改动 Java sample / API / workflow gate
- 不在本轮做 npm registry 真发布

## Options Considered

### Option A：只改 README
优点：改动最小。
缺点：不能解决用户真正关心的“像 superpowers 一样能从 plugin marketplace 装”的问题。

### Option B：补最小 plugin-marketplace 资产 + 同步文档
优点：能让当前仓库至少具备**本地 marketplace 可安装**的形态，最接近用户要的体验。
缺点：仍不等于公共 marketplace 发布。

### Option C：直接做公共 marketplace 发布
优点：最接近终态。
缺点：需要外部发布权限、发布流程、版本管理与持续维护，超出本轮最小可交付。

## Selected Option and Rationale

选择 **Option B**。

理由：

- 用户要的是“像 superpowers 一样，在 Claude Code 里加 marketplace、安装、更新”
- 当前环境已证明 Claude Code plugin system 本身可用
- 本仓库只差最小 plugin metadata / marketplace catalog / hooks payload / 文档收口
- 因此最合理的最小交付是：
  - 让仓库目录本身可以被 `claude plugin marketplace add /path/to/repo`
  - 让用户能 `claude plugin install <plugin>@<marketplace>`
  - README 明确区分：
    - **今天可用的本地 marketplace 安装**
    - **尚未完成的公共 marketplace / registry 发布**

## Rejected Options

- 拒绝只改 README：因为这会继续回避用户真正的安装体验问题
- 拒绝直接承诺“已是 superpowers 同级公共插件”：因为当前没有对应发布证据

## Affected Layers

- repo-level plugin metadata
- runtime command façade 文档
- plugin install / marketplace onboarding 文档
- plugin-mode hooks declaration

## Interface Contract

### External API

本轮新增对外安装合同：

1. 添加本地 marketplace：
   - `claude plugin marketplace add /path/to/enterprise-harness`
2. 从该 marketplace 安装插件：
   - `claude plugin install enterprise-harness@enterprise-harness`
3. 更新 marketplace / plugin：
   - `claude plugin marketplace update enterprise-harness`
   - `claude plugin update enterprise-harness@enterprise-harness`

### Internal service contract

- plugin manifest 指向当前仓库已有 skills / commands / hooks / mcp surface
- bin 入口继续转发到 `harness/plugin/runtime/cli.mjs`

### Compatibility / caller impact

- 保留现有 clone + direct CLI 路径
- 保留 `node bin/enterprise-harness.mjs <command>` 路径
- 新增 plugin marketplace 路径，不移除现有入口

## Data / SQL Design

- 不适用。

## Architecture Boundary

- 仍保持 repo contract 与 machine-local runtime 分离
- 本轮只是把现有 repo assets 包装成 Claude plugin 可识别形态
- 不引入新的业务层依赖

## Flow / State Changes

新增用户主路径：

1. `claude plugin marketplace add /path/to/enterprise-harness`
2. `claude plugin install enterprise-harness@enterprise-harness`
3. 重启 Claude Code 会话
4. 通过 `/harness` 或 plugin 提供的 surface 进入工作流

保留备选路径：

- clone 仓库后直接运行 runtime CLI
- `node bin/enterprise-harness.mjs <command>`

## Testing Strategy

### Unit

- 不需要传统单元测试；本轮以 plugin manifest / marketplace manifest / install contract smoke 为主

### Integration

- 新增 installability smoke：
  - `claude plugin validate <repo>/.claude-plugin/plugin.json`
  - `claude plugin validate <repo>/.claude-plugin/marketplace.json`
  - 在临时目录或本地 marketplace 模式下执行：
    - `claude plugin marketplace add <repo>`
    - `claude plugin install enterprise-harness@enterprise-harness --scope local`
    - `claude plugin list`
  - 断言安装后 plugin 可见，且 metadata 与 README 对齐

### Backend API E2E

- 不适用

### RED path

- 当前仓库缺少 `.claude-plugin/plugin.json`
- 当前仓库缺少 `.claude-plugin/marketplace.json`
- 当前 README 没把 marketplace/plugin 安装写成第一等入口
- 因此 plugin validate / plugin install smoke 应先失败

## Rollout and Rollback

### Rollout

1. 先补 `.claude-plugin/plugin.json`
2. 再补 `.claude-plugin/marketplace.json`
3. 再补 `hooks/hooks.json`
4. 再改 README / installation-guide / overview
5. 跑本地 plugin validate / install smoke

### Rollback

- 如果 plugin marketplace 安装 smoke 不稳定，保留文档中的 clone path 为 fallback 主路径
- 不删除现有 runtime CLI 入口

## Risks

- plugin manifest 字段若与 Claude Code 当前 schema 不兼容，会导致安装失败
- plugin hooks 路径若不符合 plugin root 语义，安装后行为可能与 repo-local hooks 不一致
- 过度宣传“像 superpowers 一样”会误导成“已公共发布”，需要明确限定为**本地 marketplace/install/update 路径可用**

## Open Questions

- 当前仓库是否需要把 `.claude/skills/` / `.claude/agents/` 暴露为 plugin `skills` / `agents` 目录，还是只先暴露 commands + hooks + runtime CLI 文档
- plugin install 后是否还需要额外 setup/doctor 路径，文档中需不需要像 OMC 一样提供 `/setup` 式后置动作

## Design Self-Review

- 本轮设计对准了用户真实诉求：不是像插件，而是尽量让它真的能从 Claude Code plugin marketplace 装
- 仍保留现实边界：只承诺“本地 marketplace 可装/可更新”，不伪称“公共市场已上线”

## Approval

- 待 design review
