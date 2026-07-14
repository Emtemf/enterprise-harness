---
name: harness-intake
description: >
  企业 Java 后端需求入口。用于把用户需求先做结构化 intake，再决定是否进入轻量路径或完整 design/plan/TDD 路径。适用于新增功能、Bug 修复、API 变化、数据结构变化、架构治理与平台规则调整。要求优先做 codegraph-first 代码探索；涉及外部库、框架、SDK 或版本行为时优先 Context7-first。只对会改变后续路径的未知项做澄清，默认一次问一个高影响问题。
---

# Harness Intake

## 目标

把需求从“用户一句话”转成仓库内可追踪的 change 输入，而不是直接开始写代码。

## 入口职责

收到需求后，必须先完成以下动作，再决定是否进入设计或实现：

1. 判断 request shape：`new` / `modify` / `mixed` / `unknown`
2. 做 provisional triage
3. 做 minimum discovery
4. 根据证据形成 final route（L0/L1/L2/L3）
5. 明确下一个 artifact / gate，而不是直接进入实现

## 默认顺序

1. 判断是新增、修改还是 mixed
2. 做 provisional triage
3. 做 minimum discovery
4. codegraph-first；失败才 grep / Read，并留痕
5. 外部库/框架问题走 Context7-first；不足再官方文档
6. 只针对会改变路径的未知项发起澄清
7. 形成 final route（L0/L1/L2/L3）
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
- 只问会改变后续路径的问题
- 低影响局部选择应采用合理默认并记录
- 无法确定时应 block，而不是猜测继续
- 若多个问题彼此强耦合，只能在确有必要时合并成一组

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

## 产物落点

- 长期真相进入 `harness/specs/`
- 活动 change 进入 `harness/changes/<change-id>/`
- 探索证据进入 `harness/explorations/` 或 change evidence
- 项目根 `CLAUDE.md` 只保留短地图，不承载细节规则全文

## 对 L1+ 的最小资产生成规则

当 final route 为 L1、L2 或 L3 时，必须确保以下最小资产存在并被更新：

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
