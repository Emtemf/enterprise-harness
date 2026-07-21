# Design

## Requirement Alignment

本 change 的目标不是继续堆叠“有多少入口”，而是把当前仓库收口成一个**小白用户几乎没有认知负载**的安装与使用路径：

1. 获取仓库
2. 通过 Claude Code 本地 marketplace 安装 `enterprise-harness`
3. 打开 Claude Code 会话后直接从 `/harness` 开始

设计重点因此不是新增一层 runtime 能力，而是让**已存在的 plugin install surface、`/harness` 单入口、相关文档、change 资产和验证证据**对齐。

## Current-State Evidence

当前仓库已经具备的事实：

- `.claude-plugin/plugin.json` 已存在，可被 Claude Code validate
- `.claude-plugin/marketplace.json` 已存在，可被 Claude Code validate
- `hooks/hooks.json` 已存在，plugin-mode hooks payload 已落地
- `harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs` 已验证：
  - `claude plugin validate .claude-plugin/plugin.json`
  - `claude plugin validate .claude-plugin/marketplace.json`
  - `claude plugin marketplace add <repo>`
  - `claude plugin install enterprise-harness@enterprise-harness --scope local`
  - `claude plugin list`
  - `claude plugin marketplace update enterprise-harness`
  - `claude plugin update enterprise-harness@enterprise-harness --scope local`
- `harness/plugin/runtime/test/harness-stage-router-smoke.mjs` 已验证：
  - `/harness` 仍是 clarify-first staged workflow 的单一入口
  - design/plan/tdd/verify stage skill skeleton 仍存在
- `README.md`、`docs/zh-cn/installation-guide.md`、`docs/zh-cn/overview.md`、`AGENTS.md` 已改成 plugin-first + `/harness` single-entry 口径
- `verification-reviewer-task1.json` 已明确指出：真正落后的不是实现，而是 durable state / validation 台账

当前主要缺口：

- `requirements.md` 此前缺失
- `change.md` / `design.md` / `tasks.md` / `validation.md` / `state.json` 还停留在旧叙事
- `harness/plugin/runtime/ONBOARDING.md` 如果继续被看作普通用户文档，会重新抬高认知负担，因此必须显式降级为 maintainer / 排障附录
- plugin install 后 hooks 的真实运行时触发尚未纳入本轮证据

## Scope / Non-goals

### Scope

- 对齐 `.claude-plugin/*`、`hooks/hooks.json` 与文档叙事
- 对齐 `README.md` / `installation-guide.md` / `overview.md` / `AGENTS.md` 的零认知负担主路径
- 对齐 `harness/plugin/runtime/ONBOARDING.md` 的文档定位，使其只作为 maintainer / 排障附录
- 对齐 `/harness` 单入口合同与其 smoke 证据
- 对齐 `requirements/change/design/tasks/validation/state/reviews` 等 durable assets
- 重新执行 installability / docs / stage-router / repo verify 证据，形成 fresh validation

### Non-goals

- 不在本轮承诺公共 marketplace 发布
- 不在本轮做 npm registry 真发布
- 不在本轮补 plugin install 后 hooks 的运行时 E2E
- 不在本轮改动 Java sample / API / workflow gate
- 不在本轮新增新的 runtime 命令或 contract 语义

## Options Considered

### Option A：只补 change 资产，不碰相关用户文档
优点：改动小。
缺点：无法确保“小白用户零认知负担”的目标仍然成立，也无法机械复核入口体验是否回退。

### Option B：以 plugin-first + `/harness` single-entry 为准，统一实现、文档、smoke、change 资产
优点：能同时保证用户体验和 durable truth 对齐。
缺点：需要同步更新多份资产并重跑验证。

### Option C：继续推进公共 marketplace / registry 发布
优点：更接近终态产品。
缺点：超出当前 change 的最小边界，也会把问题从“认知负担”转移成“分发工程”。

## Selected Option and Rationale

选择 **Option B**。

理由：

- 用户要的不是再多一个入口，而是**少解释、少前置知识**
- 当前仓库已经有足够的本地 marketplace 能力，不需要再发明另一条安装路径
- 当前最值得做的是把“安装插件，然后从 `/harness` 开始”收成 durable truth，并用 smoke 持续守住

## Affected Layers / Owning Scope

- plugin metadata：`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`
- plugin-mode hooks declaration：`hooks/hooks.json`
- user-facing onboarding docs：`README.md`、`docs/zh-cn/installation-guide.md`、`docs/zh-cn/overview.md`、`AGENTS.md`
- maintainer appendix docs：`harness/plugin/runtime/ONBOARDING.md`
- workflow entry contract：`.claude/skills/harness/` 及其 `harness-stage-router-smoke.mjs`
- change assets / state / validation / reviews：`harness/changes/runtime-installability-polish/`

owning scope 明确限定为：**plugin install surface + `/harness` entry surface + onboarding docs + durable change assets**。

## Interface Contract

### External install contract

对普通用户，当前唯一推荐主路径是：

1. `claude plugin marketplace add /absolute/path/to/enterprise-harness`
2. `claude plugin install enterprise-harness@enterprise-harness --scope local`
3. 进入 Claude Code 会话
4. 直接从 `/harness` 开始

### Workflow entry contract

- `/harness` 是普通用户唯一工作流前门
- 其余 `bootstrap` / `doctor` / `sync` / `verify` / `start-change` / `lifecycle` 都只属于 maintainer / operator / 排障入口
- `harness-stage-router-smoke.mjs` 作为当前最小机械证据，证明 `/harness` 仍是 stage router，而不是被其他入口替代

### Fallback / maintainer contract

只在维护或排障时再使用：

- `node bin/enterprise-harness.mjs <command>`
- `node harness/plugin/runtime/cli.mjs <command>`
- `bootstrap` / `doctor` / `sync` / `verify` / `start-change`

### Compatibility / caller impact

- 保留 clone + direct CLI 路径
- 保留仓库 bin 入口
- 新叙事把这些路径降级为 fallback / maintainer path，不再作为普通用户主线

## Data / SQL Design

- 不适用。

## Architecture Boundary

- 仍保持 repo contract 与 machine-local runtime 分离
- 本轮不新增新的业务层依赖
- 本轮只收口用户入口、plugin install surface 与 durable change truth
- Java `interfaces / application / domain / infrastructure` 分层、repository port、Req/Rsp/Dto/Entity/Mapper 本轮均 **N/A / 未受影响**

## Flow / State Changes

普通用户主路径：

1. 获取仓库
2. 添加本地 marketplace
3. 安装 `enterprise-harness`
4. 在 Claude Code 中输入 `/harness`

维护者主路径：

1. 如需排障，再进入 installation guide 的附录或 `harness/plugin/runtime/ONBOARDING.md`
2. 必要时使用 bin / runtime CLI
3. 使用 `verify` / smoke / review artifacts 做事实确认

### 目标 machine-readable 收口状态

在本轮收口完成后，`harness/changes/runtime-installability-polish/state.json` 应至少满足：

- `state = VALIDATED`
- `workflow.stage = archive`
- `workflow.clarifyReady = true`
- `workflow.userConfirmedScope = true`
- `workflow.planReady = true`
- `workflow.tddStatus = refactor-verified`
- `workflow.nextEntry = "/harness"`
- `validation.status = fresh`
- `validation.digest` 为 runtime 计算值
- `validation.validatedAt = 2026-07-17`

同时必须诚实保留一个已知边界：

- plugin install 后 hooks 的真实运行时触发 **未在本轮验证完成**，只能作为后续项记录，不得写成已完成事实

## Testing Strategy

### Unit

- 不适用；本轮以 deterministic smoke 为主。

### Integration

- `node harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs verify`
  - 验证 plugin / marketplace validate、add、install、list、update
- `node harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs verify`
  - 验证 README / 安装教程 / overview / AGENTS 的关键字符串合同
- `node harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify`
  - 验证 `/harness` 仍是单入口 stage router 合同
- `node harness/plugin/runtime/cli.mjs verify --json`
  - 验证 repo contract checks 未被 change 资产补账破坏

### Backend API E2E

- 不适用。

### RED path

- installability smoke 的 RED 已在 Task 1 历史执行中观察到
- docs smoke 的 RED 已在 Task 2 历史执行中观察到
- stage-router smoke 本轮作为 verify 证据，不新增新的 RED 目标
- 本轮主要补 fresh verify 与 durable assets 对齐

## Rollout and Rollback

### Rollout

1. 补 `requirements.md`
2. 对齐 `change.md` / `design.md` / `tasks.md`
3. 更新相关附录文档，避免普通用户重新看到 runtime CLI 主线
4. 跑 installability / docs / stage-router / repo verify
5. 刷新 `validation.md`
6. 用 reviewer verdict 收口后再更新 `state.json`

### Rollback

- 若 plugin docs / assets 有回退风险，仍可保留 clone + direct CLI path 作为 fallback
- 不删除现有 runtime CLI / bin 入口
- 不把未验证的公共 marketplace 叙事写成完成事实

## Risks

- 如果文档重新混入多个平级入口，小白用户又会回到“先学系统结构”的高认知负担路径
- 如果 `ONBOARDING.md` 继续表现为普通用户主文档，会与 `/harness` 单入口目标冲突
- 如果 durable assets 不更新，后续 session 会继续误判当前 change 还停留在 clarify
- 如果把“本地 marketplace 可安装”误写成“公共市场已发布”，会造成能力边界漂移
- plugin install 后 hooks 的真实触发尚未验证，不能把这一点偷换成“完整插件体验已经全部验证”

## Open Questions

- 是否需要单开后续 change，补 plugin install 后 hooks 的真实触发 E2E
- 是否需要再开独立 productization change，把“获取仓库”这一步也进一步降负担为公共分发路径

## Design Self-Review

- 当前设计直接对准了用户目标：减少普通用户的认知负担，而不是继续增加术语和入口
- 同时仍保持事实边界：只承诺本地 marketplace install/update 已可用，不伪称公共市场已上线
- 设计把“代码已完成但 change 资产未补齐”识别为本轮主问题，避免继续在实现层空转
- 设计已把 `/harness` 单入口合同、相关附录文档定位、以及目标 machine-readable 完成态写成可检查项

## Approval

- 待 design review