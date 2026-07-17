# Requirements

## 原始需求

用户反馈当前 README 没有跟上最新 installability 实现，而且当前接入方式不像 Claude 插件，小白用户需要先理解 runtime/backend 命令，认知负担过高。

## 澄清后的目标

以“小白用户可以没有认知负载地使用我们”为收口标准，把当前仓库收敛成一条几乎不需要解释的用户路径：

1. 获取仓库
2. 通过 Claude Code 本地 marketplace 安装 `enterprise-harness`
3. 进入 Claude Code 会话后直接从 `/harness` 开始

普通用户不需要先理解：

- runtime CLI 子命令
- hooks / gate 的分层细节
- `bootstrap` / `doctor` / `sync` / `verify` / `start-change`
- clone path、bin path、plugin path 之间的内部实现关系

这些低层内容只保留给 maintainer / operator / 排障场景。

## 范围

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `hooks/hooks.json`
- `README.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/overview.md`
- `AGENTS.md`
- installability / docs smoke 证据
- `runtime-installability-polish` change 资产补账

## 非目标

- 不在本轮宣称已经发布到公共 marketplace
- 不在本轮宣称已经完成 npm registry 发布
- 不在本轮改变 runtime contract 语义
- 不在本轮扩展 Java sample / API / workflow gate
- 不在本轮补做 plugin install 后 hooks 的真实运行时触发 E2E

## 关键参与者 / 用户 / 调用方

- 首次接触项目的小白用户
- 维护仓库和排障的 maintainer / operator
- Claude Code plugin marketplace / install / update surface
- `/harness` workflow 入口
- runtime CLI / hooks 作为后台实现层

## 业务上下文

当前仓库已经具备：

- 本地 marketplace add / install / update 所需的最小 plugin 资产
- `/harness` 作为单一工作流入口的仓库合同
- runtime installability 与 docs smoke

真正的缺口不再是“有没有实现”，而是：

- 用户视角是否已经收口成零心智切换的路径
- durable change 资产是否已经把这些事实记录完整

## 约束

- 真实能力边界必须诚实表达
- 可以明确宣称“本地 marketplace 可安装/可更新”
- 不得误写成“公共 marketplace 已发布”
- 对普通用户保持 `/harness` 单一前门
- backend 命令只能作为附录或排障入口

## 接口 / API 关注点

- 安装入口：`claude plugin marketplace add /absolute/path/to/enterprise-harness`
- 安装动作：`claude plugin install enterprise-harness@enterprise-harness --scope local`
- 更新动作：`claude plugin marketplace update enterprise-harness` 与 `claude plugin update enterprise-harness@enterprise-harness --scope local`
- 用户工作流入口：`/harness`

## 数据 / SQL 关注点

- 不适用；本轮不涉及业务数据或 SQL。

## 验收标准

- `.claude-plugin/plugin.json` 与 `.claude-plugin/marketplace.json` 可被 Claude Code validate
- 本地 marketplace add / plugin install / plugin update contract 有机械 smoke 证据
- README / 安装教程 / overview / AGENTS 对普通用户都收口为“安装插件，然后从 `/harness` 开始”
- 文档明确把 backend 命令降级为 maintainer / 排障附录
- change 资产完整记录当前事实、边界与验证证据

## 歧义评分

- Goal clarity: 5
- Scope clarity: 5
- User/actor clarity: 5
- Data/SQL clarity: 5
- Interface/API clarity: 5
- Acceptance criteria clarity: 5
- Constraint/risk clarity: 5
- Overall: 5

## 当前最弱维度

- 运行时体验仍依赖用户先拥有本地仓库路径，因此“零认知负载”当前是指**安装与入口解释尽量零负担**，不是“已达到公共插件市场一键发现安装”。

## 需要继续澄清的问题

- plugin install 后 hooks 的真实运行时触发是否要单开后续 change 做 E2E 证据
- 是否需要再开独立 change，继续把“获取仓库”这一步也产品化为更低负担的公共分发路径

## Repo / 文档事实依据

- `README.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/overview.md`
- `AGENTS.md`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `hooks/hooks.json`
- `harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs`
- `harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs`

## 用户确认

- 状态: confirmed-by-user-in-conversation
- 已确认范围: 直接补 durable change 资产，并以“小白用户没有认知负载地使用我们”为目标收口
- 备注: 用户明确要求优先做 change 资产对齐，而不是继续分散改代码或反复解释现状。
