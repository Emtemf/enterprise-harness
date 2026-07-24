---
name: harness-intake
description: >
  Clarify-first staged workflow 的 clarify/route 子流程入口。用于把用户需求先做苏格拉底式澄清、ambiguity scoring、repo/documentation fact gathering，再形成 final route，并决定是否进入 design/plan/TDD/verify 主流程。适用于新增功能、Bug 修复、API 变化、数据结构变化、架构治理与平台规则调整。要求优先 codegraph-first 与 Context7-first，并默认一次只问一个高价值问题。
---

# Harness Intake

## 角色定位

本阶段默认以 **Product Owner 视角**主导，但必须保留当前 clarify-first 方法论：
- 苏格拉底式提问
- ambiguity scoring
- weakest-dimension targeting
- 先探索，再问用户
- 必要时做轻量头脑风暴 / 多方案发散后再收敛

角色化只能增强“谁主导澄清”，不能把 clarify 退化成僵硬问卷。


## 项目上下文前置

进入 intake 时，必须优先读取目标项目的 `CLAUDE.md` / 根目录事实（若存在），理解：
- 项目愿景 / 做什么 / 不做什么
- 验收标准
- 项目约束与高层命令

不得在忽略目标项目 `CLAUDE.md` 的情况下，直接用通用默认值替代项目上下文。

## 入口职责

收到需求后，必须先完成以下动作，再决定是否进入 design 或实现：

1. 判断 request shape：`new` / `modify` / `mixed` / `unknown`
2. 进入 `clarify`：通过探索 + 一问一答降低歧义
3. 做 provisional triage
4. 做 minimum discovery
5. 根据证据形成 final route（L0/L1/L2/L3）
6. 明确下一个 artifact / gate，而不是直接进入实现

### 实现前 orchestration guardrail（硬约束）

在任何代码实现、任务推进或生产文件修改之前，必须至少满足：

- 已明确当前 change / 执行范围
- 已完成 `clarify` 或至少已达到 clarify-ready 并获得用户确认
- 已完成 `route`（L1+ 变化不得跳过）

若上述条件不满足，不得开始实现，也不得把“我已经足够理解需求”替代为正式的阶段推进。

## 默认顺序

1. 判断是新增、修改还是 mixed
2. 先做 minimum discovery
3. codegraph-first；失败才 grep / Read，并留痕
   - **【硬约束】代码探索必须委托 subagent**：主 orchestrator 不得自己直接用 grep/Read 搜索代码。必须通过 Agent 工具派遣 `subagent_type: code-explore` 代码探索。这是强制委派规则，不是建议。
   - **派遣 Agent 时，prompt 开头必须写"先用 codegraph_explore / codegraph_search 等 MCP 工具"**——不要只说"Explore"而不指定工具，否则弱模型会直接用 grep
   - **Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness codebase` 或 `Explore this repo`**
   - **必须等 subagent 返回结论后再推进；主 orchestrator 不得无视 subagent 结果并重复发起相同探索**
4. 外部库/框架问题走 Context7-first；不足再官方文档
5. 基于事实进入苏格拉底式澄清
6. 一次只问一个高价值问题，并维护 ambiguity scoring
   - **每轮必须向用户展示评分表**：全维度分数 + overall + weakest dimension + 评分依据
   - **用户有权修正评分**：如果用户说"这个应该是 3 不是 4"，必须接受并调整
   - 评分依据必须引用具体探索发现或用户回答，不得凭空打分
7. 在 clarify-ready 且用户确认后，形成 final route（L0/L1/L2/L3）
8. 明确下一个 artifact / gate

## Provisional Triage 最低输出

至少明确记录：

- request shape
- candidate scope
- candidate tier
- hard signals（api_change / schema_change / architecture_change / platform_rule_change / cross_service_change）
- unknowns

在没有探索前，`unknown` 不能被解释为 `no`。

## Minimum Discovery 最低要求

### 经验库先行（避免重复踩坑）
- 进入正式澄清前，先检索跨 change 经验库：`node harness/plugin/runtime/lifecycle.mjs lesson-list`
- 若当前需求涉及某类主题（如 validation / digest / api / state），用 `lesson-list <tag>` 过滤
- 命中相关教训时，必须在澄清或设计中主动提示该坑与既有规避方式，不得让同样问题重复发生
- 经验库为空或无匹配时，直接继续，不因此 block

### 代码探索
- Java 仓库默认 codegraph-first
- 若 codegraph 不可用，必须记录：失败原因、改用工具、搜索范围、当前可信度
- L3 在 codegraph 不可用且影响面无法确认时，默认 blocker

### 文档探索
- 对外部库、框架、SDK、版本行为默认 Context7-first
- 当前项目默认使用 `bash harness/bin/context7-library.sh` / `bash harness/bin/context7-docs.sh` 作为可用路径
- 若未来项目补齐 Context7 MCP，也可把 MCP 作为优先路径
- 至少记录：library name、resolved library id、version、query、结论
- Context7 不足时回退到 vendor docs / 官方源码

## Socratic 澄清原则

- 默认一次一个高影响问题
- 默认优先使用**选项式问题**（A/B/C + 其他），而不是把一整组开放式问题一次性丢给用户
- 每轮都应显式针对 weakest dimension 发问
- 只问会改变后续路径的问题
- 低影响局部选择应采用合理默认并记录
- 无法确定时应 block，而不是猜测继续
- 若多个问题彼此强耦合，只能在确有必要时合并成一组
- clarify 结束前必须达到 clarify-ready，并获得用户确认
- 未达 clarify-ready 时，不得建议“跳过 clarify 直接进入 design/plan”
- 每轮有价值的澄清问答，应记录到可复盘的 session log：
  `node harness/plugin/runtime/cli.mjs workflow note <change-id> clarify-qa "<问题与用户选择摘要>"`

## Ambiguity Scoring 最低要求

至少跟踪以下维度：

- T 目标 clarity
- Scope clarity
- User / actor clarity
- Data / SQL clarity
- Interface / API clarity
- Acceptance criteria clarity
- Constraint / risk clarity

最低规则：
- 每轮更新一次分数
- 标出 weakest dimension
- **每轮必须向用户展示评分表**：全维度分数 + overall + weakest + 评分依据
- **用户有权修正评分**：如果用户说"这个应该是 3 不是 4"，必须接受并调整
- 评分依据必须引用具体探索发现或用户回答，不得凭空打分
- 只有在关键维度达标（所有维度 ≥ 4）且用户确认执行范围后，才允许进入 final route

## Final Route 最低输出

必须显式记录：

- final tier
- owning module / domain / service
- API / data / architecture / rule impact
- routing reason
- evidence links
- blockers
- decisions required
- 对应的 `change-id`
- `state.json` 是否已从 `DRAFT` / `DISCOVERED` 推进到更准确状态

`change-id` 应采用简短 kebab-case，并能表达这次需求的主语义。若需求后续被拆分为多个 slice，应在 `change.md` 中明确拆分原因与边界。

形成 final route 后，应记录一条 route 决策事件，供后续复盘：
`node harness/plugin/runtime/cli.mjs workflow note <change-id> route-decided "tier=<L?> 因为 <理由>"`

会话恢复或复盘时，可用 `node harness/plugin/runtime/cli.mjs workflow session-log <change-id>` 查看该 change 的决策时间线。

## 产物落点

- 长期真相进入 `harness/specs/`
- 活动 change 进入 `harness/changes/<change-id>/`
- 探索证据进入 `harness/explorations/` 或 change evidence
- 项目根 `CLAUDE.md` 只保留短地图，不承载细节规则全文

## 对 L1+ 的最小资产生成规则

当 final route 为 L1、L2 或 L3 时，必须确保以下最小资产存在并被更新：

- `harness/changes/<change-id>/requirements.md`
- `harness/changes/<change-id>/state.json`
- `harness/changes/<change-id>/change.md`
- `harness/changes/<change-id>/evidence/tooling.md`
- `harness/changes/<change-id>/validation.md`

如不存在，应按 `harness/templates/` 里的模板创建；如已存在，应更新而不是重复创建平行文档。

### 推荐脚手架命令

优先按以下顺序使用：

```bash
bash harness/bin/create-change-scaffold.sh <change-id> [owner] [tier]
bash harness/bin/create-exploration-artifact.sh <change-id> <topic-kebab-case>
bash harness/bin/update-change-state.sh <change-id> <state> [tier]
bash harness/bin/set-active-change.sh <change-id>
```

含义：

1. `create-change-scaffold.sh`：创建最小 change 资产
2. `create-exploration-artifact.sh`：为本次最小探索生成 evidence 骨架
3. `update-change-state.sh`：在 intake 推进过程中更新 state/tier
4. `set-active-change.sh`：当要开始触达 `reference-service` 受治理路径前，显式设置 active change

这些命令都可重复执行；若 change 已存在，不应重复平行创建第二套文档。

### `state.json` 最少要更新
- `tier`
- `state`
- `impact`
- `tooling.codegraph`
- `tooling.documentation`
- `decisions`
- `blockers`
- `workflow.stage`
- `workflow.clarifyReady`
- `workflow.userConfirmedScope`
- `workflow.nextEntry`

### `change.md` 最少要更新
- 原始需求
- 业务结果
- 非目标
- 归属模块 / 业务域
- 初步路由
- 最小探索证据
- 最终路由
- 影响矩阵
- 需要确认的决策
- intake 是否已生成对应的 `change-id`

### `evidence/tooling.md` 最少要更新
- codegraph 状态、查询、关键发现、fallback reason
- Context7 / vendor docs 状态、query、关键发现、fallback reason

### `validation.md` 规则
在 intake 阶段默认允许先存在空骨架，但不得伪造“已验证通过”的结果。只有在实际运行验证命令后，才允许填写通过证据。

## 下游要求

### L0
- 默认不创建完整 change bundle
- 做定向验证即可

### L1
- 至少进入轻量 spec
- 必须有定向 RED → GREEN → REFACTOR 证据

### L2
- 必须有 durable design
- design 批准后才能进入 plan

### L3
- 必须走完整设计路径
- 需要明确 reviewer verdict

## 禁止事项

- 不得在 intake 前直接进入实现
- 不得在 codegraph 可用时直接跳过到 grep
- 不得把 Context7 当最终权威来源
- 不得在关键未知项未澄清时假装 final route 已确认
- 不得把聊天上下文当成唯一状态来源
- 文档说明用中文；代码标识符保持英文
- **不得自己直接用 grep/Read 搜索代码做探索——必须委托 `code-explore` subagent**
- **发起 subagent 探索时，必须使用 `subagent_type: code-explore`，不得使用 `general-purpose` 做代码探索**
- **发起 subagent 探索时，禁止把标题/任务描述硬编码为 harness 仓库或 `enterprise-harness`，必须对准当前用户需求与目标项目**
- **收到 subagent 探索结论后，不得无视结论并重新探索同一问题；必须消费结论，只在存在新缺口时再发起补盲探索**
