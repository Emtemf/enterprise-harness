# Enterprise Harness

给 Claude Code 一套企业级的 SOP 骨架，让较弱的模型也能在明确约束下，稳定完成需求分流、设计、计划、TDD、验证与归档。

面向 **Java 后端 / Spring Boot** 场景，默认采用 codegraph-first 代码探索与 Context7-first 文档检索。

## Quickstart

### 前置要求

- **Claude Code** CLI 已安装（`claude` 命令可用）
- **Node.js >= 20**
- 推荐安装 `codegraph`（代码探索）和 `ctx7`（文档检索）

### 安装（作为 Claude Code 插件）

**方式 A：在 Claude Code 会话里（推荐）**

```
/plugin marketplace add https://github.com/Emtemf/enterprise-harness
/plugin install enterprise-harness@enterprise-harness
```

**方式 B：在终端里**

```bash
claude plugin marketplace add https://github.com/Emtemf/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

安装后，skills、agents、hooks 会自动加载到你的 Claude Code 会话。

### 更新

**Claude Code 会话里：**

```
/plugin marketplace update enterprise-harness
/plugin update enterprise-harness@enterprise-harness
```

**终端等价 CLI：**

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

> 本地安装（`--scope local`）更新时必须带 `--scope local`。或用一键更新（封装了 marketplace update + plugin update + 清理旧缓存）：
> ```bash
> node harness/plugin/runtime/cli.mjs update-local
> ```

### 开始使用

安装后，**用户唯一入口**：`/harness`。在任意项目里打开 Claude Code，输入：

```
/harness
```

就这样。后续的一切都从这个入口展开。

就这样。后续的一切都从这个入口展开。

### Fallback：手动安装（离线 / 企业代理 / TLS 不稳）

如果 plugin marketplace 在你的网络环境下不可用，可从 [GitHub Releases](https://github.com/Emtemf/enterprise-harness/releases) 下载 tarball，用安装脚本复制到目标项目：

```bash
tar -xzf enterprise-harness-*.tar.gz -C /tmp/eh
cd /tmp/eh
node bin/install.mjs --target /path/to/your/project --dry-run   # 先预览
node bin/install.mjs --target /path/to/your/project             # 再执行
```

安装脚本会**智能合并** settings.json，不覆盖你已有的 hooks。

## 它是怎么工作的

当你输入 `/harness`，它不会直接跳进去写代码。它会先后退一步，问你到底想做什么。

它会先探索代码与文档（codegraph-first + Context7-first），再做**苏格拉底式澄清**——一次只问一个高价值问题，逐步把歧义降到你确认执行范围为止。

确认后，需求进入一条分阶段状态机：

```
clarify → route → design → plan → tdd → verify → archive
```

每个阶段都有**模板、gate、durable artifact**。reviewer 门禁是硬约束——reviewer 返回 block，就不得进入下一阶段。连这个 harness 自己改自己，都得走一遍这条流程。

这意味着：状态不在聊天上下文里丢失，打断后能从 durable `state.json` 恢复；完成声明必须由新鲜验证证据支撑，不是空话。

## 核心工作流

1. **clarify** — 苏格拉底式一问一答 + ambiguity scoring，先探索再问用户
2. **route** — 分流到 L0/L1/L2/L3 tier，确定 owning scope 与影响面
3. **design** — durable design.md，强制覆盖接口/数据/架构边界/测试策略
4. **plan** — tasks.md，拆成可机械执行的切片，含 touched files 与 RED/GREEN 证据点
5. **tdd** — 严格 RED→GREEN→REFACTOR，没有 RED 证据不得改生产源码
6. **verify** — 消费 reviewer verdict + validation freshness，确认完成态
7. **archive** — 物理归档到 `harness/archive/`

每个 change 还会自动生成一张 **GUIDE.md 导航卡**——愿景、做什么、不做什么、验收命令，弱模型不用读完整份卷宗就知道红线在哪。

## 设计谱系

第一性目标是**给较弱模型兜底**：模型在缺约束时会跳步、糊弄验收、丢状态。所以用"厚 SOP + 机械门禁 + durable 状态"替代"模型自觉"。各支柱来源见 `harness/upstream/registry.json`：

- **分阶段 SOP** ← Superpowers
- **归档与资产分层** ← OpenSpec
- **苏格拉底式 clarify** ← deep-interview
- **打断后可继续** ← gump（durable state）
- **角色视角** ← role-workbench（草案）
- **代码探索** ← CodeGraph · **文档检索** ← Context7

## 适合谁 / 不适合谁

**适合**：
- Java 后端团队，想让 AI 稳定交付而不是乱写
- 弱模型场景，需要厚约束兜底
- 企业合规要求，需要可追溯的 durable artifact 与 reviewer 门禁

**不适合**：
- 只想做快速原型、不想走流程
- 前端为主（本项目不做 UI 点击测试）
- 期待"一问就出代码"的体验

## 维护者命令

发布：

```bash
npm run release -- --dry-run     # 预览版本 bump
npm run release                   # 发布（patch）
npm run release -- --minor        # 发布（minor）
```

发布前建议验证插件安装流程（端到端，依赖网络）：

```bash
# 推送 tag 后，验证用户能从 marketplace 安装到正确版本
EXPECTED_PLUGIN_VERSION=0.1.10 node harness/plugin/runtime/test/plugin-install-flow-smoke.mjs
```

排障 / 低层控制（需要低层控制时使用 `node bin/enterprise-harness.mjs <command>`）：

```bash
node harness/plugin/runtime/cli.mjs doctor     # 环境体检
node harness/plugin/runtime/cli.mjs verify     # 契约检查
node harness/plugin/runtime/cli.mjs status     # 当前状态
```

> verify 只声明 contract checks；runtime readiness 需另行运行 doctor / sync / upstream-check。

## 深入阅读

- `PROGRESS.md` — 当前进度快照
- `harness/specs/staged-workflow.md` — 分阶段工作流规范
- `harness/specs/session-lifecycle.md` — 会话生命周期规范
- `CLAUDE.md` — 项目约束与编码基线
- `AGENTS.md` — 面向人类与各类 agent 的协作合同

## 当前状态

- 版本：见 [Releases](https://github.com/Emtemf/enterprise-harness/releases)
- 平台 smoke：Linux / macOS / Windows 已在 CI 验证
- Java 黄金样板仍在完善中，非最终企业级标准

## License

Apache-2.0
