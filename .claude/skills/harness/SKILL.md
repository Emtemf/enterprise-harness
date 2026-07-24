---
name: harness
description: >
  Enterprise Harness 的统一 SOP 入口与阶段编排器。按闭环五检 (TECPC) 驱动的 clarify-first staged workflow 推进需求：clarify → route → design → plan → tdd → verify → archive。每个阶段有明确的产出物、门禁和 TECPC 检查。
---

# Harness — TECPC 分阶段 SOP 入口

## 这个 skill 做什么

你是 harness 工作流的**统一流程入口与阶段编排器**。用户的每个需求都从这里进入，按 7 个阶段顺序推进。
每个阶段都要过**闭环五检 (TECPC)**，不达标不能进下一步。

这是 clarify-first staged workflow：`clarify / route / design / plan / tdd / verify / archive`。

### 实现前 orchestration guardrail（硬约束）

在任何代码实现、设计落地、任务推进或生产修改之前，必须先满足：
- 已进入 `/harness` 或显式 staged workflow 入口
- 已完成 `clarify`（或至少 clarify-ready 并获得用户确认）
- 已完成 `route`（L1+ 变化不得跳过）

不得在未完成 clarify / route 前直接进入实现。这是 orchestration 级门禁，不是建议。
- 不得给“跳过 clarify 直接进 design/plan”的逃逸路径

## 完整 SOP 步骤序列

收到用户需求后，**严格按以下顺序执行**。不要跳步，不要自作主张。

**【强制】每步操作后输出 TECPC 状态卡**：每完成一个阶段或关键动作，在对话文本中输出当前闭环五检卡，让用户看到进度。不要只依赖 hook 输出——对话文本中的输出用户一定能看到。

### 第 0 步：建立 change（如果还没有）
```
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] "<一句话目标>"
```
这会创建 `harness/changes/<id>/state.json` 并设置 `goal`。

### 第 1 步：clarify（需求澄清）
**目标**：把模糊需求变成明确的、可执行的、用户确认的需求。先进入 `clarify`。

1. **先委托探索**（不得自己做）：
   - 【硬约束】代码探索必须委托 subagent
   - 派遣 `subagent_type: code-explore` 探索代码，不得使用 `general-purpose` 做代码探索
   - subagent prompt 开头写"先用 codegraph_explore / codegraph_search"
   - Agent 标题写用户的项目名 + 具体主题（禁止写 `enterprise-harness`）
2. **一次只问一个问题**（选项式 A/B/C + 其他）
3. **每轮展示歧义评分**：7 维度 × 0-5 分 + overall + weakest + 评分依据
4. **用户有权修正评分**——接受并调整
5. **产出**：`requirements.md`（TECPC 五维：T 目标 / E 证据 / C 上下文 / P 路由 / C 纠正）
6. **达标条件**：所有维度 ≥ 4 + 用户确认执行范围
7. 更新 `state.json`：`workflow.clarifyReady=true`、`workflow.userConfirmedScope=true`

### 第 2 步：route（路由决策）
**目标**：确定变更复杂度 tier。

1. 基于 clarify 结果判断 L0/L1/L2/L3
2. 记录 `routingReason`（为什么选这个 tier）
3. 更新 `state.json`：`tier`、`goal`
4. 产出：`change.md` 记录路由决策

### 第 3 步：design（TECPC 驱动设计）
**目标**：产出可评审的、有证据支撑的设计。

1. 读 `requirements.md` 和探索证据
2. **【强制】创建 `design.md`**：
   - 使用 `Write` 工具创建 `harness/changes/<change-id>/design.md`
   - 基于 `harness/templates/design.md` 模板
   - 必须包含 TECPC 五维：
     - **T 目标**：业务目标 + 成功标准
     - **C 上下文**：探索事实（引用具体文件）+ 影响矩阵
     - **E 证据**：每个决策的证据来源 + 测试策略 + 验证命令
     - **P 路径**：方案对比表 + 接口/数据/架构设计 + 风险回滚 + **纠正预案**
3. 跑 `design-reviewer`，获得 pass verdict
4. 更新 `state.json`：`gates.designApproved=true`、`workflow.stage='design'`
5. **不得在 design.md 不存在时进入 plan**

### 第 4 步：plan（任务拆分）
**目标**：把设计拆成可机械执行的任务。

1. **【强制】创建 `tasks.md`**：
   - 使用 `Write` 工具创建 `harness/changes/<change-id>/tasks.md`
   - 基于 `harness/templates/tasks.md` 模板
   - 每个 task 必须有：
     - Touched files（完整路径）
     - Implementation order
     - **RED evidence point**（哪个测试先失败 + 对应 mvn 命令）
     - **GREEN evidence point**（哪个测试后通过 + 对应 mvn 命令）
     - Acceptance checks
2. 跑 `plan-critic`，获得 pass verdict
3. 更新 `state.json`：`workflow.planReady=true`、`workflow.stage='plan'`
4. **不得在 tasks.md 不存在时进入 tdd

### 第 5 步：tdd（RED → GREEN → REFACTOR）
**目标**：先证明问题存在，再写最小实现。

**【强制】TDD 必须通过 subagent 执行，不得在主对话中直接写代码。**

1. **派遣 subagent**：
   - 使用 `Agent` 工具，`subagent_type: general-purpose`
   - `isolation: "worktree"`（每个 task 在独立 worktree 中执行）
   - prompt 包含：task 描述、touched files、RED/GREEN evidence point、目标项目构建命令
2. **Subagent 必须执行真实构建命令**：
   - Java/Maven：`mvn test` / `mvn verify` / `mvn compile`
   - 不得跳过构建命令
   - RED：执行测试 → 必须失败 → 记录失败输出
   - GREEN：执行测试 → 必须通过 → 记录通过输出
   - REFACTOR：执行测试 → 必须全绿 → 记录通过输出
3. **Subagent 返回结果必须包含**：
   - `task-id`
   - `tdd-status`: `test-written` / `red-verified` / `green-verified` / `refactor-verified`
   - `command-executed`: 实际执行的 mvn 命令
   - `command-output-summary`: 构建输出摘要
   - `evidence-path`: 证据文件路径
4. **主 orchestrator 只保留结果摘要**，不堆积整段构建输出
5. 更新 `state.json`：`workflow.tddStatus` 逐步推进

### 第 6 步：verify（验证收口）
**目标**：用新鲜证据确认完成。

1. 更新 `validation.md`（运行了什么命令、结果是什么）
2. 跑 `cli.mjs verify`（必须 OK）
3. 跑 `verification-reviewer`（必须 pass）
4. 更新 `state.json`：`validation.status=fresh`

### 第 7 步：archive（归档）
```
node harness/plugin/runtime/cli.mjs lifecycle archive <change-id>
```

## TECPC 检查（每个阶段都要过）

| 维度 | 每阶段必须回答 |
|------|--------------|
| **T 目标** | 这一步要达成什么？产出物是什么？ |
| **C 上下文** | 基于什么事实/证据？引用具体文件 |
| **E 证据** | 用什么证明这步做对了？（测试/reviewer/命令输出） |
| **P 路径** | 为什么这么做？错了怎么恢复？ |

## 硬约束（程序级门禁会拦截）

- 写 `src/main/java` 前：必须已完成 clarify + route + design + plan + codegraph 证据
- 主 orchestrator 不得直接 Grep/Read/Glob 探索业务代码——必须委托 `code-explore` subagent
- 跳过任何阶段都会被 pre-write hook BLOCK（12 道拦截）
- 探索业务代码会被 pre-explore hook BLOCK（除非已记录 codegraph 证据）

## 阶段判定（怎么知道当前在哪步）

读取 `harness/ACTIVE_CHANGE` + `state.json` 的 `workflow.stage`、`workflow.clarifyReady`、`workflow.userConfirmedScope`：
- 无 active change → 第 0 步
- `requirements.md` 缺失 / clarify 未达标 / 用户未确认范围 → 第 1 步
- `state.json.state` 仍在 `DRAFT` / `DISCOVERED` / tier 未设置 → 第 2 步
- `design.md` 缺失 / design approval 不存在 → 第 3 步
- `tasks.md` 仍是 draft / plan verdict 不可消费 → 第 4 步
- `state.json.state` 为 `TASKED` / `EXECUTING` / `tddStatus` 未到 `refactor-verified` → 第 5 步
- `state.json.state` 为 `REVIEWED` / `VALIDATED` 但 validation 缺解释 → 第 6 步
- validation 已 fresh 且完成声明成立 → 第 7 步

判定后必须明确告诉用户：
1. 当前 stage
2. 当前缺口（artifact / approval / evidence）
3. 推荐恢复入口（skill 或 backend command）
4. 当前为何还不能进入下一阶段

## 未初始化目标项目的约束

- 若当前项目还没有 harness 资产或 runtime 初始化信息，不得因为缺少 `.harness/`、bootstrap marker、或本地 adapter 而阻断普通用户继续通过 `/harness` 进入澄清流程
- 对普通用户，这类缺口只能作为"维护者可后续补 bootstrap/doctor/sync"的建议，不能当作必须先完成的前置条件

## Exploration Lane（补事实的通道）

clarify 阶段应优先补事实再问用户，不得先问用户去替系统做 repo discovery：
- 代码事实 / 调用链 / 影响面不清 → `code-explore`（codegraph 一套搞定定位+传播）
- 外部库/框架/SDK 版本行为不清 → `doc-research`

## 禁止事项

- reviewer 返回 block，不得进入下一阶段
- 不得跳过任何阶段
- 【硬约束】代码探索必须委托 subagent，必须使用 `subagent_type: code-explore`，不得使用 `general-purpose` 做代码探索
- 不得自己直接用 grep/Read 搜索代码做探索——必须委托 `code-explore` subagent
- Agent 标题必须指向当前目标项目和具体探索主题，禁止写成 `Explore enterprise-harness`
- 必须等待 subagent 返回结论，并把结论作为后续阶段的事实来源；不得无视结论并重新发起相同的探索
- 不得一次问多个问题
- 不得不展示歧义评分就推进
- 不得在没有 RED 证据时写生产代码
- 不得在 codegraph 可用时跳过 codegraph-first
- **【硬约束】design 阶段必须创建 `design.md`**，不得跳过直接进入 plan
- **【硬约束】plan 阶段必须创建 `tasks.md`**，不得跳过直接进入 tdd
- **【硬约束】TDD 阶段必须通过 subagent 执行**，不得在主对话中直接写代码
- **【硬约束】TDD subagent 必须使用 `isolation: "worktree"`**，实现隔离
- **【硬约束】TDD subagent 必须执行真实构建命令**（`mvn test` / `mvn verify`），不得跳过
