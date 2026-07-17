# Enterprise Harness

一个围绕 **Claude Code** 的企业后端交付骨架项目。

它的目标不是单纯证明“模型会写代码”，而是把一次需求从输入到落地，推进成一套更接近企业团队协作的工程过程：**可探索、可落盘、可审查、可验证、可恢复、可跨机器接入**。

> 当前状态：**可运行的 repo contract + portable runtime MVP，且已进入 clarify-first staged orchestrator 主线**
>
> 它已经足够作为团队共享、跨会话可恢复、跨机器可接入的第一版骨架；clarify-first staged workflow 的第一版 contract / template / worker / guidance / smoke 也已落地，但距离完整企业级强门禁平台仍有后续行为深化工作。

---

## 为什么会有这个项目

很多 AI coding workflow 停留在：

- 会话里说过的话，下轮就丢了
- 模型容易直接开写，跳过设计、TDD 和验证
- 项目规则写了很多，但没有真正接进运行时
- change、review、validation、evidence 分散在不同地方
- 换一台机器或换一个系统后，本地运行方式不一致

**Enterprise Harness** 想解决的不是“再写一套 prompt”，而是把 Claude Code 放进一套更像工程系统的结构里。

---

## 这个项目是什么

你可以把它理解成两层：

### 1. Repo Contract（仓库共享契约）
团队共享、提交进仓库：

- `AGENTS.md`
- `CLAUDE.md`
- `.claude/rules/`
- `.claude/agents/`
- `.claude/skills/`
- `harness/specs/`
- `harness/templates/`
- `harness/changes/`
- `harness/config.yaml`

这部分负责定义：

- 工作流
- 规则
- 资产结构
- reviewer 角色
- change 生命周期
- 文档与探索证据的落点

### 2. Portable Runtime（跨平台运行层）
每台机器本地适配：

- `harness/plugin/runtime/cli.mjs`
- `bootstrap` / `doctor` / `sync` / `verify`
- `install` / `setup-local-adapter` / `upgrade` / `migrate`
- `local-adapter.schema.json`
- `local-adapter.example.json`
- Node 版 hook adapters

这部分负责解决：

- OS / shell 差异
- 本地路径与命令
- 环境变量与 secrets
- 本机工具可用性
- 本地接入、自检、同步与迁移

---

## 一个请求进来后，会发生什么

这套 Harness 的重点不是“马上改代码”，而是先让流程站住。

### 当前主路径
1. **加载项目 contract**
   - Claude Code 通过 `.claude/settings.json` 接入 SessionStart / PreToolUse / PostToolUse / Stop hooks
2. **从 `/harness` 进入 staged workflow**
   - `/harness` 是单一用户入口，后续按阶段路由而不是让用户自行猜下一步
3. **先澄清，再推进**
   - workflow 正在收敛为：`clarify -> route -> design -> plan -> tdd -> verify -> archive`
   - clarify 阶段会先自动探索代码/文档，再进行一问一答澄清，并在用户确认后进入下一阶段
4. **探索优先下沉到适当层**
   - 代码问题默认 **codegraph-first**
   - 外部库/框架问题默认 **Context7-first**
   - 高噪声探索应优先下沉为 read-only subagent，主 orchestrator 只消费压缩结论
5. **必要时落 change 资产**
   - 把 `requirements.md`、`state.json`、`change.md`、`design.md`、`tasks.md`、`validation.md`、`evidence/*.md` 放进 `harness/changes/`
6. **写入前过 gate**
   - 对受治理路径（当前重点是 `reference-service/`）检查 active change 与当前阶段 gate
7. **写入后自动检查**
   - 结构、轻语义、review/evidence 状态检查
   - 必要时把 validation 标为 stale，并提示下一阶段或恢复入口
8. **完成前必须刷新验证证据**
   - Stop gate 会阻止 stale validation 或缺失 validation 资产的“伪完成”状态
   - 同时明确提示：change-specific 结论应回写 change 资产，repo-level 阶段信息应回写 `PROGRESS.md`，Claude memory 只保存显式触发的非仓库事实

更详细的时序图见：

- [`docs/zh-cn/overview.md`](docs/zh-cn/overview.md)

---

## 当前已经真实可用的能力

### 代码探索与文档检索
- **codegraph-first** 已真实可用
- **Context7 CLI wrapper** 已真实可用
- 已有明确 fallback policy，而不是静默退回 grep / Read

### change 生命周期与治理骨架
- `harness/changes/` 资产模型已成形
- `state.json` / `change.md` / `validation.md` / `evidence/tooling.md` 已形成最小 change bundle
- `active change` 与受治理路径写入约束已接入 runtime gate

### runtime CLI
当前统一入口：

```bash
node harness/plugin/runtime/cli.mjs <command>
```

其中本轮与 local adapter diagnostics 直接相关的最小命令包括：
- `node harness/plugin/runtime/cli.mjs setup-local-adapter --write`
- `node harness/plugin/runtime/cli.mjs doctor --json`
- `node harness/plugin/runtime/cli.mjs sync --json`

当前已具备：

- `bootstrap`
- `doctor`
- `sync`
- `verify`
- `status`
- `workflow`
- `install`
- `setup-local-adapter`
- `update`
- `upgrade`
- `migrate`
- `upstream-check`
- `lifecycle`
- `context7`

### hook adapters
`.claude/settings.json` 当前已接上：

- `SessionStart`
- `PreToolUse`
- `PostToolUse`
- `Stop`

### 平台 smoke matrix
GitHub Actions `platform-smoke` 当前已覆盖：

- Linux
- macOS
- Windows

当前可以准确表述为：

> Linux 已长期实测；macOS / Windows 的当前 runtime smoke 路径已在 CI matrix 验证通过。

---

## 当前还不该夸大的地方

这个项目当前**不是**：

- 完整企业级强门禁平台
- 已 fully productized 的公开安装插件
- 所有路径都已接入同等强度 gate 的系统
- 所有本机环境都零差异支持的成品

以下能力仍在继续建设中：

- 更完整的 plan gate / task gate
- task 子状态 `NOT_STARTED -> TEST_WRITTEN -> RED_VERIFIED -> GREEN_VERIFIED -> REFACTOR_VERIFIED -> TASK_REVIEWED -> DONE` 的更强机读消费
- 更细粒度的 `RED_VERIFIED` 消费逻辑
- `/harness` 的 automation-first lifecycle runner 行为深化
- 真实 HTTP API E2E
- 更强 OpenAPI 语义门禁
- 更完整 installer / upgrade / migration 体验
- 更广泛真机开发机场景验证

---

## 适合谁 / 不适合谁

### 适合谁
- 想把 Claude Code 用进 **Java / Spring Boot 后端团队流程**的人
- 想让 AI coding 从“会话技巧”进入“项目契约 + runtime + change 资产”的团队
- 想以 codegraph-first / Context7-first 方式组织探索和文档检索的人
- 想基于现有骨架继续做企业化扩展的人

### 不适合谁
- 想找一个已经发布完成、可一键安装的成品插件的人
- 想把它直接当成完整 CI/CD 与质量平台替代品的人
- 只关心前端 UI 点击测试的人

---

## 入口（先记两个层次）

如果你只想先知道“从哪进”，只记住这一条：

- **用户唯一入口**：`/harness`

其余命令（如 `start-change` / `bootstrap` / `doctor` / `sync` / `verify`）都是 `/harness` 背后的后台动作、fallback 或维护工具，不应被理解成与 `/harness` 并列的多个用户入口。

## Quickstart

> 现在最推荐的接入方式已经不是“只会 clone 仓库后手动跑脚本”，而是：
>
> 1. **在 Claude Code 里把当前仓库加成一个本地 marketplace**
> 2. **从该 marketplace 安装 `enterprise-harness` 插件**
> 3. **需要时通过 marketplace / plugin update 更新**
>
> 同时保留 clone + direct CLI 作为 fallback / 开发路径。

### 前置要求
- Node.js **>= 20**
- 已安装 Claude Code CLI（`claude` 命令可用）
- 推荐安装 `codegraph`
- 推荐可用 `npx` / `ctx7`

### 1. 获取仓库
```bash
git clone https://github.com/Emtemf/enterprise-harness.git
cd enterprise-harness
```

### 2. 在 Claude Code 里添加本地 marketplace
如果你想要的是 **像 superpowers 那样的 plugin 安装体验**，当前已经支持本地 marketplace 路径。

#### 方式 A：在 Claude Code 会话里执行 slash command
```bash
/plugin marketplace add /absolute/path/to/enterprise-harness
/plugin install enterprise-harness@enterprise-harness
```

#### 方式 B：在终端里执行等价 CLI
```bash
claude plugin marketplace add /absolute/path/to/enterprise-harness
claude plugin install enterprise-harness@enterprise-harness --scope local
```

当前这条链路已经在本仓库本地验证通过：
- marketplace add
- plugin install
- plugin list 可见 `enterprise-harness@enterprise-harness`
- plugin update / marketplace update 可用

### 3. 更新 marketplace / plugin
#### Claude Code 会话里
```bash
/plugin marketplace update enterprise-harness
/plugin update enterprise-harness@enterprise-harness
```

#### 终端等价 CLI
```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local
```

### 4. 安装后怎么进入工作流
安装插件后，对用户仍然只有一个前门：

- 直接从 `/harness` 开始

如果你只是正常使用这套 SOP，不需要记住 `bootstrap` / `doctor` / `sync` / `verify` 这些后台命令。它们属于：

- `/harness` 背后的 backend 动作
- fallback / troubleshooting 工具
- maintainer / repo operator 视角的命令面

普通用户可以先忽略下面这些命令；它们仅保留给需要低层控制的人：
```bash
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]
```

### 6. 查看当前全局状态
```bash
node harness/plugin/runtime/cli.mjs status
node harness/plugin/runtime/cli.mjs status --json
```

### 7. 使用 workflow runner（最小可用）
```bash
node harness/plugin/runtime/cli.mjs workflow run <change-id> [owner] [tier] [topic]
node harness/plugin/runtime/cli.mjs workflow resume [change-id]
node harness/plugin/runtime/cli.mjs workflow status [change-id] --json
node harness/plugin/runtime/cli.mjs workflow decide <change-id> <decision> [reason]
```

当前它提供 machine-readable 的：
- `state`
- `stage`
- `status`
- `nextAction`
- `pendingDecision`
- `recommendedLane`
- `currentGap`
- `revision`
- `lastEventId`

### 8. 在 Claude Code 会话中进入工作流
- 对用户始终优先从 `/harness` 开始
- `harness-intake` / `harness-design` / `harness-plan` / `harness-tdd` / `harness-verify` 只作为 subordinate recovery entry 或高级入口
- `start-change` / `doctor` / `sync` / `verify` 等命令只作为 `/harness` 背后的后台动作与 fallback，不应要求普通用户记忆

### 9. 可选：使用 npm scripts
```bash
npm run bootstrap
npm run doctor
npm run sync
npm run verify
npm run upstream-check
```

### 10. fallback：仍可直接走仓库 bin / direct CLI
如果你不想用 plugin marketplace，仍可直接运行：

```bash
node bin/enterprise-harness.mjs <command>
# 或
node harness/plugin/runtime/cli.mjs <command>
```

### 7. `reference-service` 的当前本地 Java quality gate

当前本地 Java quality gate 命令：mvn -f /home/wula/IdeaProjects/sdd/reference-service/pom.xml verify

它当前负责：
- ArchUnit 架构边界检查
- JaCoCo report / check
- `reference-service` 作为 reference quality profile 的本地 Maven 质量门禁
- real backend sample 的 random-port HTTP E2E 证据（当前已在独立 change 中推进）
- random-port HTTP E2E

注意：repo-level `node harness/plugin/runtime/cli.mjs verify` / `bash hooks/full-verify.sh` 仍主要是 repo contract / runtime contract 校验，**不是** `reference-service` 的 Java quality gate。
后续 CI 应复用同一个 Maven verify 命令，而不是重新定义另一套绿灯含义。

完整安装说明见：

- [`docs/zh-cn/installation-guide.md`](docs/zh-cn/installation-guide.md)
- [`harness/plugin/runtime/ONBOARDING.md`](harness/plugin/runtime/ONBOARDING.md)

---

## 关键目录地图

```text
.
├── README.md
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   ├── rules/
│   ├── agents/
│   └── skills/
├── hooks/
├── harness/
│   ├── bin/
│   ├── changes/
│   ├── explorations/
│   ├── plugin/
│   ├── reviewers/
│   ├── specs/
│   ├── templates/
│   └── work/
├── docs/
│   └── zh-cn/
└── reference-service/
```

### 最重要的几个位置
- `CLAUDE.md`：项目高层操作合同
- `.claude/rules/`：自动加载规则源
- `harness/specs/`：长期稳定规范
- `harness/templates/`：change / design / tasks / validation 模板
- `harness/changes/`：活动 change 资产
- `harness/plugin/runtime/`：跨平台运行层
- `reference-service/`：Java 参考样板，不是插件本身的全部核心

---

## 文档地图

### 先看这些
- [`docs/zh-cn/overview.md`](docs/zh-cn/overview.md)
- [`docs/zh-cn/installation-guide.md`](docs/zh-cn/installation-guide.md)
- [`docs/zh-cn/announcement.md`](docs/zh-cn/announcement.md)
- [`docs/zh-cn/launch-post-kit.md`](docs/zh-cn/launch-post-kit.md)
- [`docs/zh-cn/github-release-v0.1.0.md`](docs/zh-cn/github-release-v0.1.0.md)

### 核心 contract / spec
- [`PROGRESS.md`](PROGRESS.md)
- [`CLAUDE.md`](CLAUDE.md)
- [`harness/specs/plugin-runtime.md`](harness/specs/plugin-runtime.md)
- [`harness/specs/session-lifecycle.md`](harness/specs/session-lifecycle.md)
- [`harness/specs/staged-workflow.md`](harness/specs/staged-workflow.md)
- [`harness/specs/local-runtime-adapter.md`](harness/specs/local-runtime-adapter.md)
- [`harness/specs/containerization-sandboxing.md`](harness/specs/containerization-sandboxing.md)
- [`harness/specs/evidence-submission.md`](harness/specs/evidence-submission.md)
- [`harness/specs/platform-validation-matrix.md`](harness/specs/platform-validation-matrix.md)
- [`harness/specs/release-readiness.md`](harness/specs/release-readiness.md)
- [`harness/specs/mvp-roadmap.md`](harness/specs/mvp-roadmap.md)

### 对外协作
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/`
- `.github/workflows/platform-smoke.yml`
- 当前 orchestration/gate 主线的 issue 关系与 open issue 对齐说明见：`harness/changes/clarify-first-staged-orchestrator/evidence/open-issues-matrix.md`

---

## 当前路线图（简版）

### Iteration 1：clarify-first orchestrator + 门禁收紧
- 主线 issue：#20（single human entrypoint / automation-first lifecycle runner）
- 支撑 issue：#8、#11（design / plan / task / RED / validation gate 收紧）
- `/harness` 作为单一主入口与阶段编排器
- clarify / route / design / plan / tdd / verify / archive 主线
- design gate
- stale validation gate
- `RED_VERIFIED` 才允许生产源码写入
- reviewer verdict 消费逻辑更明确
- exploration lanes（code-explore / doc-research / impact-explore）

### Iteration 2：Java 黄金样板增强
- 主线 issue：#9、#12
- ArchUnit
- JaCoCo 85%
- 真实 HTTP API E2E
- 更强 OpenAPI 契约语义校验

### Iteration 3：runtime / distribution productization
- 主线 issue：#10、#13、#15
- machine-local adapter 正式 schema 继续收紧
- 更完整 installer
- upgrade / migration 机制完善
- 本地 source-external release smoke path
- 更广泛平台 / 真机验证

---

## 语言约定

- 仓库文档、流程资产、评审说明默认使用**中文**
- 代码标识符、包名、公开 API 默认保持**英文**

---

## 一句话总结

**Enterprise Harness** 当前已经不是“几篇规则文档 + 一堆脚本”，而是：

> 一套围绕 Claude Code 的企业后端交付骨架：有共享契约、有变更生命周期、有本地运行层、有跨机器接入入口，并且当前正沿 #20 + #8/#11 主线收敛为 clarify-first staged orchestrator。
