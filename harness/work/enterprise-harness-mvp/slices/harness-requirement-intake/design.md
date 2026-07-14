# Enterprise Harness Target Architecture（目标架构）

## 状态

目标架构草案，非 v1 规范性执行文档。

第一版必须执行的范围、gate、artifact 与验收标准，以同目录下的 `normative-v1-design.md` 为准。本文件用于保存完整愿景、上游映射、双轴评审框架、数据库治理、协作治理和 v2/v3 路线图；未被提升到 v1 文档的内容，不得自动成为第一版 hard requirement。

这份目标架构用于把当前 MVP 从“较窄的 codegraph exploration 模板”演进为企业定制的 **Harness Requirement Intake** 与后续治理体系。它不是 implementation plan，也不能单独授权代码实现。

## 目标

为企业 Java 服务工作建立一个**轻量但可沉淀**的统一入口，让每个非平凡需求在进入 planning 或 implementation 之前，都先具备正确的上下文、证据、用户决策和设计检查。

这层 intake 必须让 harness 成为我们自己的工作流，而不是直接复用上游 Superpowers 或 OpenSpec 的叫法与流程。

## 非目标

- 不要把每个小改动都变成重流程。
- 不要把 `CLAUDE.md` 变成大型知识仓库。
- 不要为每个小 package 都要求 nested `CLAUDE.md`。
- 不要用 hooks 替代语义级 review。
- 不要在纯业务规则变更、且本地代码证据已足够时强制文档查询。
- 不要在这个 slice 中实现 CLI、installer、dashboard 或跨服务 orchestrator。

## 核心流程

更新后的标准流程为：

```text
用户需求
  ↓
Harness Requirement Intake
  ├─ 先判断是新增还是修改
  ├─ 判断 change tier
  ├─ 找 owning module / business domain
  ├─ 判断知识应该沉淀到哪里
  ├─ codegraph 可用时优先做代码探索
  ├─ 需要时做条件式 docs lookup
  ├─ 用 AskUserQuestion 澄清会改变路径的决策
  ├─ 记录 assumptions 和 low-impact defaults
  └─ 通过 intake readiness gate
  ↓
Harness Scoping
  ↓
Harness Design
  ↓
Design Self-Review
  ↓
Design Review Gate / 用户确认
  ↓
Harness Plan
  ↓
Plan Self-Review / Plan Review Gate
  ↓
TDD Execution
  ↓
Implementation Review
  ↓
Verification Self-Review / Verification Gate
  ↓
根据情况归档到 harness/work、harness/changes、harness/specs
```

## 上游映射与主动改造

这份设计不是“直接使用 Superpowers + OpenSpec”，而是：

> 有选择地继承上游机制，并把它们改造成 Harness 自己的正式流程与术语。

因此，**上游来源关系必须在 design 中体现**，不能只留到 implementation plan。

### 为什么必须在 design 中体现

因为这不是实现细节，而是目标 operating model 的一部分。它决定：

- 我们到底保留了哪些上游机制
- 哪些地方做了改造
- 哪些上游做法被明确放弃
- 后续团队应该把什么当“正式概念”，而不只是历史来源

如果只在 plan 里体现，三个月后团队通常只会看到“要创建哪些文件”，却看不到：

- 为什么这样分层
- 为什么不用上游原名
- 为什么某些上游特性没有被纳入标准流程

### 设计层必须表达的内容

Design 中应明确三类信息：

1. **保留的上游机制**
2. **被改造后的机制**
3. **明确不继承的上游做法**

建议用映射表表达：

| 来源 | 上游机制 | 在 Harness 中的处理 | 说明 |
|---|---|---|---|
| Superpowers | 一次问一个问题的澄清纪律 | 保留并强化 | 继续保留，但对 path-changing decisions 优先使用 `AskUserQuestion` |
| Superpowers | brainstorming 作为前置流程 | 改造 | 不再沿用原名，拆成 `Harness Requirement Intake` + `Harness Scoping` |
| Superpowers | spec self-review | 保留并强化 | 扩展为 intake/design/plan/result 多阶段自检，其中 design 最强 |
| Superpowers | 强同步、对话式确认 | 改造 | 保留同步模式，同时增加 async review path |
| Superpowers | visual companion | 暂不纳入标准流程 | 可作为能力存在，但不是 phase-1 harness hard requirement |
| OpenSpec | artifact lifecycle 思路 | 保留并改名 | 使用 `harness/` 下的 `explorations/`、`work/`、`changes/`、`specs/` |
| OpenSpec | proposal / stable spec 分离 | 保留 | 继续区分活动工作与稳定规范，但不用 `openspec/` 命名 |
| OpenSpec | 以 artifact 为中心的治理方式 | 保留并扩展 | 增加 instruction layering、design gate、anti-regret constraints |
| 上游品牌术语 | 原始名词直接进入团队标准 | 明确放弃 | 通过 glossary 转成 Harness 自己的正式术语 |

### Plan 中应该体现什么

Plan 也要体现上游改造，但体现方式不同。

Plan 不负责回答“我们在概念上继承了什么”，而负责回答：

- 哪些文件要新增或更新
- 哪些规则要迁移成 Harness 原生表达
- 哪些目录要从上游灵感变成仓库中的正式结构
- 哪些 hooks/tests/reviewer 要补齐来支撑这些设计决策

换句话说：

- **Design** 负责说明“保留 / 改造 / 放弃了哪些上游机制，以及为什么”
- **Plan** 负责说明“怎么把这些决定落到具体文件、目录、hook、test 和 reviewer 上”

### 后续文档要求

为避免三个月后再次混淆，后续至少应补：

- `harness/specs/glossary.md`
- `harness/specs/instruction-layering.md`
- `harness/specs/rule-enforcement-matrix.md`

这样团队能同时看到：

- 正式术语
- 指令层级
- 规则执行位置
- 与上游来源的关系

## Change tier（变更等级）

Gate 强度必须随着风险和范围变化。

| 等级 | 例子 | 要求的流程 |
|---|---|---|
| L0 trivial | typo、措辞调整、小文档更新 | 简短说明 + 定向验证 |
| L1 local code | 单方法 bug fix、局部业务规则、无 API/数据影响 | 轻量 intake + 定向测试 + 结果证据 |
| L2 feature/API | 新接口、OpenAPI 变化、持久化变化、新业务能力 | 完整 intake + durable design + design self-review + plan + TDD + verification |
| L3 architecture/cross-service | 架构边界变化、共享平台规则、跨服务行为 | 完整流程 + reviewer gates + 明确用户确认 + 必要时 waiver review |

每个变更都应该有设计意识，但默认只有 L2/L3 需要完整的 durable design artifact。

## 指令与知识分层

Harness 必须明确每类长期知识只有一个合适的落点。

| 层 | 职责 | 应该包含什么 | 不应该包含什么 |
|---|---|---|---|
| 根 `CLAUDE.md` | 紧凑的项目操作合同 | 一句话愿景、项目做什么、不做什么、验收标准、验证命令、基础编码原则、规则/spec 入口链接 | 完整模板、临时探索结论、过长流程细节、实现日志 |
| Nested `CLAUDE.md` | 服务/模块级操作合同 | 真实服务或模块边界下的本地规则与例外 | 重复 root 规则、package 级琐碎说明 |
| `rules/` | 稳定治理规则 | workflow、requirement intake、documentation、architecture、Java style、testing、API contract、review rules | 临时证据或一次性决策 |
| `harness/specs/` | 稳定能力/流程规格 | directory model、instruction layering、requirement intake、governance model | 当前任务日志 |
| `harness/templates/` | 可复用模板 | intake、exploration、design、plan、result、self-review 模板 | 项目事实 |
| `harness/explorations/` | 带时间戳的探索证据 | codegraph 结果、docs lookup 摘要、当前影响分析 | 未经再次验证就当成永久真理 |
| `harness/work/` | 活动中的工作切片 | spec、design、plan、result、工作日志 | 长期共享规则 |
| 持久记忆 | 跨会话的非代码/项目偏好 | 非显而易见的项目约束与用户偏好 | 仓库或 git 历史里已经明显可见的事实 |

### Nested `CLAUDE.md` 策略

只有当目录代表**真实边界**时，才允许新增 nested `CLAUDE.md`，例如：

- `reference-service/CLAUDE.md`
- `services/order-service/CLAUDE.md`
- `platform-harness/CLAUDE.md`

不应该为每个 Java package 都新增，例如：`domain/`、`application/`、`interfaces/api/`。

package 级说明更适合放在：

- `README.md`
- `package-info.java`
- 架构规则文档

## 需求分流与模块归属

Requirement Intake 的第一步不应直接进入“怎么实现”，而应先回答两个路由问题：

1. 这是**新增**还是**修改**？
2. 如果是修改，它属于**哪个模块 / 业务域**？

### 新增 vs 修改

- **新增**：新能力、新接口、新表、新流程、新模板、新规则
- **修改**：已有模块、已有接口、已有表结构、已有模板或已有规则的增量调整

这个判断很重要，因为它决定：

- 是优先找现有模块并扩展，还是允许新建模块/表/规则
- intake 的重点是“发现现状”还是“定义新边界”
- 后续 design 是否必须先证明“不能复用现有结构”

### 模块归属优先于实现设计

如果需求是“修改”，默认先回答：

- 修改的是哪个模块？
- 这个模块目前位于哪一层？
- 是否已经存在相应的 interface / review / template / data 结构？
- 是否应该在现有模块内扩展，而不是创建新模块？

如果需求是“新增”，也要先回答：

- 应归属于哪个业务域？
- 是否已有可承载该能力的模块，只是之前未被识别？
- 是否需要新增模块，还是只需新增一个 slice/feature？

### 当前模块拓扑的使用原则

当前仓库里的模块划分（例如 interface 下的 `review` 模块与 `template` 模块）可以作为**当前现状证据**，但不应在全局设计中被过早固化成所有服务的永久标准，除非后续明确提升为稳定治理规则。

因此：

- 在某个具体服务中，它们应先作为 discovery 的输入
- 只有在跨服务验证后，才应上升为 `harness/specs/` 下的稳定模块模式
- 在此之前，更适合放进 service-local 的设计与说明，而不是直接写成全局强规则

## Requirement Router（需求路由器）

为了让需求进入后能够稳定进入正确路径，Harness Requirement Intake 的最前面应定义一个显式的 **Requirement Router**。

v1 不建议一上来就做成黑盒模型分类器，而应先做成：

- **规则驱动**
- **可审计**
- **可解释**
- **能直接映射到后续流程分支**

后续再逐步升级为模型辅助或独立分类器。

### Requirement Router 的目标

它不只产出一个等级标签，而是产出一个**路由向量**，把需求分流到：

- 哪种推理路径
- 哪种设计深度
- 哪种验证强度
- 是否需要 docs lookup
- 是否需要 table discovery
- 是否允许并行 subagent
- 是否必须单 writer 执行

### 建议输出结构

```yaml
request_type: new | modify
target_scope: method | module | domain | service | platform
change_tier: L0 | L1 | L2 | L3

affects_api: true | false
affects_data: true | false
affects_architecture: true | false
affects_templates: true | false
affects_rules: true | false

needs_user_decision: true | false
needs_docs_lookup: true | false
needs_codegraph: true | false
needs_table_discovery: true | false
needs_design_artifact: true | false
needs_plan_artifact: true | false

execution_mode: single-writer | parallel-safe | reviewer-only
risk_level: low | medium | high
```

### v1 / v2 / v3 路线图

#### v1：规则驱动路由器

第一版建议用显式判断规则，例如：

- modify + 单模块 + 无 API/data 影响 → L1
- 新 API 或 OpenAPI 变化 → L2
- 新表 / 改表 / migration / index / audit → L2 + Table Discovery Gate
- 跨域 / 跨服务 / 规则变化 / 架构边界变化 → L3
- 只涉及措辞、注释、小文档 → L0

#### v2：模型辅助路由器

让模型先给出预判，再由规则校验：

- 模型负责识别“看起来可能影响 API/data/architecture”的需求
- 规则负责兜底，避免误判直接放行
- 结果仍必须可审计

#### v3：独立分类器

等积累足够需求样本、误判案例和人工修正记录后，再考虑把路由器升级成专门的模型分类器。

### Requirement Router 与后续流程的关系

Router 不是额外步骤，而是 intake 的前置控制器。它的输出直接决定：

- change tier
- 是否必须 design
- 是否必须 docs lookup
- 是否必须 table discovery
- 是否需要 reviewer gate
- 是否允许 subagent 并行
- 是否必须 lesson promotion

## Seven-layer architecture map（七层架构映射）

“七脉”不应被实现成七个目录名或七个模块名，而应被理解为七种**资源预算问题**。

项目不需要第一天就把七层全部做满，但架构设计必须第一天就知道七层分别在哪里、哪些已经具备、哪些只是 roadmap。

### 七层定义

| 层 | 预算问题 | 核心问题 | 当前 Harness 对应部分 |
|---|---|---|---|
| 感知（Perception） | 注意力预算 | 什么信息进入模型、什么不进入 | Requirement Router、codegraph-first、docs lookup、Table Discovery Gate、Context Triage |
| 记忆（Memory） | 连续性预算 | 什么应跨时间保留 | `CLAUDE.md`、`rules/`、`harness/specs/`、`work/`、`explorations/`、持久记忆 |
| 推理（Reasoning） | 不确定性预算 | 当前问题需要多重的思考路径 | change tiers、design gate、self-review、complexity-based routing |
| 行动（Action） | 不可逆预算 | Agent 可以对世界做什么、风险多高 | hooks、tests、write/edit、API/data变更、未来 deploy、worktree 路线图 |
| 反思（Reflection） | 校正预算 | 做完后如何发现自己错了 | intake readiness、design/plan/result self-review、archive → lesson promotion |
| 协作（Collaboration） | 并行与分工预算 | 哪些事谁做、怎么拆分 | AskUserQuestion、async review、reviewer agents、subagent-driven TDD、single-writer/worktree 策略 |
| 治理（Governance） | 扩规模预算 | 团队变大后如何不失控 | glossary、rule-enforcement matrix、owner/cadence、waivers、directory model、stable specs |

### 设计原则

1. 七层是**观察和治理框架**，不是目录名。
2. 不允许假装某一层不存在。
3. 某一层可以暂时不实现，但必须在 design 中说明：
   - 当前是否已有能力
   - 缺口是什么
   - 未来准备落在哪个 artifact 或机制中
4. 正确的演进顺序通常是：
   - 先跑通内圈（感知 / 记忆 / 推理 / 行动）
   - 再加反思，稳定质量
   - 最后加协作与治理，扩大规模

### 与当前设计的映射结论

当前这版 design 已经较强覆盖：

- 记忆层
- 推理层
- 反思层
- 治理层雏形
- 数据治理与 API/data 双轨检查
- 协作层 roadmap

当前最值得优先补实装的是：

- 感知层中的 Requirement Router
- 感知层中的 Context Triage 规则
- 协作层中的执行策略表

## Multi-dimensional review framework（多维评审框架）

在认知功能视角之外，还需要独立观察执行结构：

> 这些能力在系统中如何被组织、执行、传播错误与恢复。

因此，这份 Target Architecture 同时使用两组评审问题：

- **功能目的**：系统正在解决哪一类认知或运行问题
- **执行特征**：工作如何流动、协调、分权和循环

它们是互补评审视角，但当前枚举并不构成严格的 `7 × 6` 笛卡尔正交坐标。一个机制可以有主功能、次功能，也可以在不同 stage 使用不同执行特征。

- 功能目的回答：**Agent 在做什么类型的工作？**
- 执行特征回答：**这些能力在系统里如何流动、组织和传播错误？**

这两个问题不能互相替代。

只说纵轴，不说横轴，会漏掉：

- 错误怎样扩散
- 并行是否安全
- 哪些步骤需要显式编排
- 哪些地方必须循环校正

只说横轴，不说纵轴，会漏掉：

- 为什么这里需要深推理而不是浅判断
- 为什么这里需要长期记忆而不是临时上下文
- 为什么这里需要协作而不是单 Agent 执行

### 工程结论

Harness 中的能力或 workflow stage，如果要进入长期设计，至少应能够回答：

1. 它的主功能目的是什么？是否存在次级功能或横切关注？
2. 它在各执行 stage 使用什么 flow shape、coordination 和 authority structure？
3. 主要失败模式、退出条件和升级条件是什么？

不再要求一个机制拥有单一“功能 × 拓扑”地址。工具、artifact、角色和基础设施属于 mechanism/carrier，不应被误当成认知功能。

## Execution topology map（执行拓扑六式）

横轴“六式”不应被误写成六个代码模块，而应被理解为六种常见执行结构。

### 六式定义

| 拓扑 | 核心问题 | 常见失败模式 | 适合的 Harness 场景 |
|---|---|---|---|
| 链式（Chain） | 串行步骤如何逐步推进 | 早期判断错，后面全链路白做 | 轻量 intake、固定顺序校验、简单 plan |
| 路由（Route） | 输入应进入哪条路径 | 误分流、漏分流、过度放行 | Requirement Router、change tier 分流、docs/table discovery 触发 |
| 并行（Parallel） | 哪些工作可同时执行 | 冲突、重复、上下文不一致 | read-only exploration、reviewer 并行审查 |
| 编排（Orchestrate） | 多能力如何受控协同 | 中心控制过弱或过强 | intake → design → plan → verification 的正式流程 |
| 层级（Hierarchy） | 上下层职责如何分离 | 规则冲突、边界不清 | `CLAUDE.md` / `rules/` / `specs/` / `work` / reviewers |
| 循环（Loop） | 如何反复修正直到过关 | 无穷迭代、没有退出条件 | self-review、verification loop、lesson promotion |

### 注意

同一种认知功能，换一种执行拓扑，工程后果会完全不同。

例如：

- **推理 × 链式**：适合流程清晰的问题，但早期分解一旦错，后面都会在错误框架里努力。
- **推理 × 循环**：适合需要反复校验的问题，但如果没有退出条件，会变成无穷修补。
- **记忆 × 层级**：可明确长期规则与临时上下文的分工。
- **记忆 × 链式**：容易把“顺序堆积上下文”误当成长期记忆。
- **行动 × 并行**：适合只读分析，不适合同一工作区内多 Agent 并发写入。
- **行动 × 编排**：适合多步骤高风险操作，但需要明确中心控制点。

## 双轴在当前 Harness 中的映射

为了让这套框架可用于设计评审，当前设计中的关键模块应标注为：

| 模块 / 机制 | 纵轴 | 横轴 |
|---|---|---|
| Requirement Router | 感知 | 路由 |
| codegraph-first exploration | 感知 | 链式 / 路由 |
| docs lookup | 感知 | 链式 |
| Table Discovery Gate | 感知 + 推理 | 路由 + 链式 |
| instruction layering | 记忆 | 层级 |
| `CLAUDE.md` / `rules/` / `specs/` 分工 | 记忆 | 层级 |
| change tiers | 推理 | 路由 |
| design artifact | 推理 | 编排 |
| design self-review | 反思 | 循环 |
| archive → lesson promotion | 反思 + 记忆 | 循环 + 层级 |
| AskUserQuestion | 协作 | 路由 |
| async review | 协作 | 编排 / 并行 |
| reviewer agents | 协作 + 反思 | 并行 / 编排 |
| single-writer policy | 行动 | 层级 / 编排 |
| future worktree execution | 行动 + 协作 | 并行 |
| glossary / rule matrix / owner cadence | 治理 | 层级 |

## 对设计评审的要求

从现在开始，凡是要进入长期设计或稳定规则的机制，都应在评审时回答：

- 它属于哪一层认知功能？
- 它属于哪一种执行拓扑？
- 它的主要失败模式是什么？
- 它的退出条件或升级条件是什么？

如果回答不出来，就说明它还只是一个点子，不是一个可治理的架构元素。

## 当前最重要的双轴落点

对当前项目来说，最值得优先落地的是：

1. **感知 × 路由**
   - Requirement Router
   - change tier 分流
   - API/data/architecture/rule impact 识别

2. **记忆 × 层级**
   - `CLAUDE.md`、`rules/`、`specs/`、`work/`、`explorations/` 的边界

3. **推理 × 编排**
   - intake → design → self-review → plan 的主干流程

4. **反思 × 循环**
   - readiness / design / plan / verification 自检闭环

5. **行动 × 并行 / 编排**
   - v1 single-writer
   - v2 worktree + subagent-driven TDD

6. **治理 × 层级**
   - glossary
   - lifecycle
   - rule-enforcement matrix
   - owner / cadence / waiver

## 与当前设计的关系

这不是一套替代当前设计的理论，而是当前 Harness Requirement Intake 的**解释框架与评审坐标系**。

- Requirement Router 是双轴里的“感知 × 路由”落点
- instruction layering 是“记忆 × 层级”落点
- design gate 是“推理 × 编排”落点
- self-review 是“反思 × 循环”落点
- worktree roadmap 是“行动 × 并行”落点
- glossary / rule matrix / lifecycle / waiver 是“治理 × 层级”落点

这意味着后续 implementation plan 不应该只是“建文件”，而应该是：

> 把这些双轴坐标中的关键节点，落实成可执行、可审计、可扩展的工程机制。

## Requirement Router 审计原因字段

为了避免 Router 退化成“仪式化打标签”，它的输出除了路由向量，还必须记录 **routing reason** 与 **override** 信息。

### 建议补充字段

```yaml
routing_reason:
  - has_api_change
  - has_schema_change
  - touches_platform_rule
  - modifies_existing_module
  - ambiguous_domain_owner

confidence: low | medium | high
human_override: true | false
override_reason: "..."
```

### 要求

- `change_tier` 不能单独存在，必须有原因字段支撑
- 如果出现人工覆盖，必须记录覆盖原因
- Router 的误判案例应进入后续规则修正或分类器训练样本

## Context Triage（上下文分诊）

Requirement Intake 不能把“收集越多上下文越好”当成默认策略。

感知层需要一个显式的 **Context Triage** 规则，用来限制注意力预算。

### 默认分诊顺序

1. **主诉**：这次到底要改什么
2. **归属**：哪个模块 / 业务域 / 服务拥有它
3. **风险**：是否影响 API / data / architecture / rule
4. **最小足够证据**：先拿到最少但足够做判断的代码与文档证据
5. **扩展上下文**：只有在前面不足以决策时，才继续展开更多文件、更多文档源、更多业务域

### 默认止损原则

- 默认最多读取少量关键文件后先判断是否需要升级到 design
- 默认最多查有限层级文档源
- 如果已经识别到 blocker，就应停止扩大上下文，而不是继续“多看一些再说”

### 失败判据

感知失败不只指“没看到信息”，也包括：

- 看了太多，导致真正关键问题被稀释
- 还没确定归属模块，就进入实现设计
- 在没有明确风险的情况下过度展开上下文

## Review metadata roadmap（评审元数据路线图）

该元数据属于 v2+ 探索项，不是 v1 hard requirement。它只标注 capability/workflow stage，不给静态 artifact、具体工具或基础设施强行分配拓扑。

### 建议方向

```yaml
classification:
  cognitive:
    primary: perception | memory | reasoning | action | reflection
    secondary: []
  operating_concerns:
    - collaboration | governance

execution:
  - stage: "..."
    flow_shape:
      - chain | route | parallel | loop
    coordination: direct | orchestrated
    authority_structure: flat | hierarchical

failure_modes: []
exit_rules: []
mechanisms: []
```

这个结构允许：

- 主功能与次功能
- collaboration/governance 作为横切关注
- 不同 stage 使用不同 flow shape
- 同时表达 coordination 与 authority structure
- 将 `AskUserQuestion`、reviewer agent、hook、worktree 等实现放到 mechanisms，而不是当成能力本身

是否将其升级为规范性 schema，必须等 v1 pilot 验证确有评审价值后再决定。

## Database catalog（数据库全局目录索引）

业务域分目录之后，还需要一个轻量的全局入口，否则三个月后会出现“分得很细，但不知道先看哪个文件”的问题。

建议增加：

```text
harness/specs/database/_catalog.md
```

### 建议内容

| 业务域 | owner | 主表 | 审计表 | 集成表 | 规范文件 |
|---|---|---|---|---|---|

### 用途

- 新需求一来，先查 `_catalog.md`
- 再进入对应业务域的 `tables.md` 或 `domain-overview.md`
- 如果 `_catalog.md` 里找不到合适归属，应提升为 Table Discovery Gate 的 blocker，而不是直接新建域或新建表

## Loop budget 与 exit criteria

当前设计已经有多个循环：

- intake readiness
- design self-review
- plan self-review
- verification self-review
- archive → lesson promotion

为了避免系统永远停留在“继续优化”而不收敛，每个 loop 都应有预算与退出条件。

### 预算（Budget）

示例原则：

- intake 默认最多 1 轮澄清 + 1 轮补充文档
- design self-review 默认最多 2 轮
- verification loop 失败达到阈值后必须升级，而不是无限重试
- docs lookup 默认最多扩展一层来源后重新评估

### 退出条件（Exit Criteria）

每个 loop 至少需要定义：

- **通过**：证据已足够进入下一阶段
- **升级**：不确定性过高，需要用户或 reviewer 介入
- **阻塞**：发现 blocker，不能继续补上下文或继续修文档来掩盖
- **放弃**：当前 slice 不适合作为一个实现单元，应拆分或重启

### 工程要求

如果一个 loop 没有 budget 和 exit rule，它就不是工程机制，只是“可能无穷迭代的好习惯”。

## Requirement Intake artifact

```text
harness/work/<work-id>/slices/<slice-id>/intake.md
```

如果 slice 很小，也可以作为 `spec.md` 中清晰分隔的一节。

Intake artifact 应记录：

- 原始需求摘要
- change tier
- 受影响的 service/module 候选范围
- 若涉及数据结构：候选业务域 / owning module
- 若涉及数据结构：现有相关表、关联表、审计表、集成表候选集合
- 若涉及数据结构：DDL / migration / compatibility 影响
- codegraph 可用性与查询内容
- docs lookup 状态与来源
- `AskUserQuestion` 决策
- assumptions 与 low-impact defaults
- slice-size 决策
- knowledge persistence 决策
- intake readiness 结论

## Codegraph 策略

对于 Java 仓库，只要 index 可用，就优先采用 codegraph-first 分析。

如果 codegraph 不可用，必须记录：

- 为什么不可用
- 使用了什么 fallback 搜索/阅读方式
- 对当前 tier 来说，fallback 是否足够
- 这是否阻塞 design

建议策略：

| 等级 | codegraph 不可用时的处理 |
|---|---|
| L0/L1 | 如果本地证据足够，可以允许 fallback |
| L2 | 必须显式提示 warning，并记录 fallback 证据 |
| L3 | 除非用户明确接受 fallback，否则视为 blocker |

## Documentation lookup 策略

Documentation lookup 采用**条件必查**策略。

当需求涉及以下内容时，必须查文档：

- framework 行为
- libraries 或 SDKs
- OpenAPI 或 schema 工具链
- 企业内部平台能力
- 版本相关行为
- authentication、authorization、security、rate limiting、compliance
- 数据库迁移或 ORM 行为

以下场景可跳过：

- 纯业务规则变化
- 现有本地代码与测试已足以支撑设计

但跳过必须写明原因。

建议的资料优先级：

1. 仓库中的代码与配置
2. root/nested `CLAUDE.md`、`rules/`、`harness/specs/`
3. 企业内部 MCP 或内部文档
4. Context7 或 package 文档
5. 官方 vendor 文档
6. 只有当前面都不够时才做 broader web search

当企业内部文档与通用 vendor 文档冲突时，必须记录冲突，并默认以企业内部规则为准，除非用户另有决定。

### 数据结构相关 docs lookup 追加要求

当需求涉及新增表、改表、索引、约束、归档、审计、分库分表或迁移策略时，docs lookup 还必须覆盖：

- 当前业务域的数据结构规则
- 该业务域下的表命名、主键、审计字段、软删/状态字段约定
- 迁移工具与 DDL 交付约定
- 上下游服务、报表、同步任务、审计链路是否依赖相关表
- 是否已有可复用表、扩展表或关联表，而不是直接新增新表

## 结构化澄清策略

`AskUserQuestion` 只用于**会改变后续路径**的决策。

应该使用 `AskUserQuestion` 的例子：

- feature scope 或 tier 选择
- compatibility / breaking-change 策略
- data model 策略
- API contract 策略
- 是否拆 slice
- docs lookup gate 强度
- 某个结论是否提升为长期治理规则

不应该使用 `AskUserQuestion` 的例子：

- 多个等价变量名之间的选择
- 是否继续进行常规文件检查
- 已完成步骤后是否顺手总结一下
- 明显有合理默认值的局部实现选择

Low-impact defaults 应由 agent 自行选择，并记录在 artifact 中。

## Intake readiness gate

在进入 design 之前，intake 必须回答：

```md
## Intake Readiness

- [ ] 需求摘要准确。
- [ ] 已分配 change tier。
- [ ] codegraph 探索已完成，或 fallback 已记录。
- [ ] 必要的 docs lookup 已完成，或跳过原因已记录。
- [ ] 会改变路径的决策已通过 AskUserQuestion 澄清。
- [ ] assumptions 和 defaults 已列出。
- [ ] slice-size 决策已记录。
- [ ] 长期知识更新点已识别。
- [ ] 可以进入 design，而无需靠猜测补全。
```

对于非显而易见的项，必须给出证据，不能只打勾。

## Design gate

Design 是这个 harness 中最重要的 gate。

对于 L2/L3 工作，在 design artifact 通过 design self-review，并获得用户或 reviewer 批准之前，不得进入 implementation plan。

Design artifact 应包含：

- requirement alignment
- 选定方案与放弃方案
- 受影响 layer
- API impact
- data impact
- error handling
- testing strategy
- architecture constraints
- docs/code evidence
- rollout 或 compatibility 说明（如适用）
- knowledge persistence decision
- anti-regret constraints

### 接口设计与数据设计双轨检查

当需求涉及后端能力变更时，design 不应只做“代码层设计”，还应至少并行回答两条线：

1. **接口设计线**
2. **数据结构设计线**

#### 接口设计线应回答

- 是新增接口还是修改已有接口
- 修改的是哪个模块下的接口
- `interface/review`、`interface/template` 等当前模块拓扑中，应该落在哪个模块
- 是否应扩展现有接口，而不是新增一个平行接口
- OpenAPI / request / response / error contract 如何变化
- compatibility / rollout 策略是什么

#### 数据结构设计线应回答

- 是新增表还是修改已有表
- 属于哪个业务域和 owning module
- 是否已有可复用主表、扩展表、关联表、审计表
- 新结构是否只是“因为没找到现有结构”而被误判为新增
- migration、backfill、rollback、audit impact 如何处理

#### 双轨汇合检查

最终 design 需要回答：

- 接口变化是否与数据结构变化一致
- 模块归属、接口归属、表归属是否一致
- 是否出现“接口落在 A 模块，但表落在 B 域且无人负责”的设计裂缝

## Design self-review

每个 durable design artifact 都应包含：

```md
## Design Self-Review
```

对于 L2/L3，self-review 至少覆盖：

1. Requirement alignment
2. Scope and slice size
3. Architecture boundaries
4. API and data impact
5. Documentation evidence
6. Testing strategy
7. Ambiguity and assumptions
8. Failure modes and rollback
9. Knowledge persistence
10. Anti-regret constraints

Self-review 必须要求**证据**，不能只有 checkbox。

示例：

```md
### Architecture boundary check

Verdict: pass

Evidence:
- Controller 仍位于 interface layer。
- Application service 仅依赖 domain 对象与 repository port。
- Domain 不依赖 Spring、JPA、interface 或 infrastructure。

Risk:
- 如果要严格执行 Clean Architecture，现有 transport DTO 在 application code 中的使用需要重构。
```

## Java 架构与编码风格 gate

Java 架构约束应主要通过**架构测试**来执行，而不是只靠 prompt 指令。

建议第一版架构测试先覆盖高价值边界：

- domain 不得依赖 Spring、JPA、interface、application、infrastructure 包
- application 不得依赖 interface-layer DTO
- controller 不得直接依赖 JPA repository
- infrastructure 不得泄漏进 domain
- transport DTO 不得被 domain 使用

这些约束建议使用 **ArchUnit** 实现。Hook 可以触发架构测试，但约束本身应该是版本化的 Java test。

Java style 应采用分层治理：

| 关注点 | 最适合的执行方式 |
|---|---|
| 架构依赖 | ArchUnit |
| 方法/类/文件大小 | Checkstyle、PMD 或自定义脚本 |
| 格式化 | Spotless 或 formatter |
| 有意义的过程型注释 | rule + reviewer |
| 过度抽象 | reviewer |

### 过程型注释

对于复杂 orchestration 方法，使用编号业务步骤注释：

```java
public CancelOrderResult cancel(String orderId, String reason) {
    // 1. Load the current aggregate before applying cancellation rules.
    Order order = orderRepository.findById(orderId)
            .orElseThrow(...);

    // 2. Validate whether the current order state allows cancellation.
    cancellationPolicy.requireCancellable(order);

    // 3. Persist the cancelled state.
    Order cancelled = order.cancel(reason);
    orderRepository.save(cancelled);

    // 4. Return an application-level result for the interface layer to map.
    return CancelOrderResult.from(cancelled);
}
```

这些注释**不要求**出现在：

- trivial getter
- constructor
- DTO record
- 一行 mapper
- 任何只会重复语法的简单方法

## 数据库表治理（Database Governance / Table Taxonomy）

数据库相关长期规范应有固定目录，并按**业务域**组织，而不是堆在一个总文件里。

推荐目录：

```text
harness/specs/database/
  _shared/
    naming-and-columns.md
    migration-policy.md
    audit-and-retention.md
  orders/
    domain-overview.md
    tables.md
    integration-boundaries.md
  payments/
    domain-overview.md
    tables.md
    integration-boundaries.md
  settlement/
    domain-overview.md
    tables.md
    integration-boundaries.md
```

说明：

- `_shared/` 放全局数据库规范
- 每个业务域目录只放该域的表、边界和集成说明
- 不建议把所有企业表放到一份超长文档里，否则上下文兜不住，也不利于需求先定位模块

### `_shared/` 建议承载的内容

- 命名规则
- 主键策略
- 通用审计字段
- 软删 / 状态字段约定
- 索引与唯一约束原则
- migration / DDL 交付规范
- 归档、保留期、审计链路的共性约束

### 业务域目录建议承载的内容

- 该域的职责边界
- 该域已有主表、扩展表、关联表、审计表清单
- 表之间的核心关系
- 该域与其他服务/报表/同步任务的边界
- 哪些表允许扩展，哪些表变更风险高

## 涉及表结构变更时的前置 gate

凡是需求涉及以下任一情况：

- 新增表
- 修改表结构
- 新增索引或约束
- 归档/审计表变化
- 分库分表策略变化
- 数据迁移策略变化

都必须先通过 **Table Discovery Gate**，再进入设计。

### Table Discovery Gate

1. 先定位业务域和 owning module
2. 再找该域下已有主表、扩展表、关联表、审计表
3. 再判断是扩展现有表、增加关联表，还是确实需要新增新表
4. 识别上下游依赖：服务、报表、同步任务、审计链路、历史兼容性
5. 记录 DDL / migration / rollback 影响
6. 只有在归属模块清楚后，才能进入 design

如果**找不到明确业务域 / owning module**，默认不应直接设计新表，而应：

- 记录为 blocker
- 提升为用户或 reviewer 决策
- 必要时先做更小的 discovery slice

### 数据结构相关 artifact 要求

当需求涉及表结构时，相关 artifact 还应包含：

- 归属业务域
- owning module / service
- 相关现有表集合
- 是否已有可复用结构
- 新表或改表的理由
- migration 策略
- compatibility / rollback 策略
- 上下游依赖清单

## Hook 策略

Hooks 应保持快速。

建议拆分为：

| Gate | 何时运行 | 例子 |
|---|---|---|
| Fast structural checks | Write/Edit hooks 与快速本地校验 | 必要目录、必要模板、明显 placeholder 检查 |
| Targeted validation | 相关 artifact 或代码变化后 | OpenAPI marker 检查、controller marker 检查、Java 分层变化时的 architecture test |
| Full verification | completion、commit 或 PR 之前 | Maven tests、ArchUnit、integration tests、完整 contract validation、安全检查 |

默认不应在每次文件编辑后都运行完整 Maven test suite。

## 目录模型与漂移防控

建立一个稳定的目录模型 spec：

```text
harness/specs/directory-model.md
```

这个文件应成为 harness 目录结构的 source of truth。

任何目录模型变更都必须同步更新：

- `harness/specs/directory-model.md`
- root `CLAUDE.md` 中对应的入口说明（如有需要）
- `hooks/validate-spec-structure.sh`
- 受影响的 templates
- 受影响的 rules/specs

## Waiver 机制

企业流程必须允许**显式例外**，而不是默默绕开。

Waiver 应记录：

```md
## Waiver

Rule:
Reason:
Scope:
Owner:
Expires:
Compensating control:
Cleanup plan:
```

Waiver 必须有 owner 且有时间边界。永久性 waiver 不应长期以“临时例外”存在，而应上升为 `harness/specs/` 下的显式治理决策。

## 归档的目的与 lesson promotion

归档的目的不只是“把文件存起来”，而是**防止团队重复犯同样的错误**。

因此，归档应区分两层：

### 1. Evidence archive（证据归档）

保留这次工作实际发生了什么：

- 做了哪些探索
- 做了哪些设计取舍
- 跑了哪些验证
- 哪些失败发生过
- 哪些步骤被跳过

这部分主要落在：

- `harness/work/.../result.md`
- `harness/explorations/`
- `harness/changes/`

### 2. Lesson promotion（经验提升）

如果这次工作暴露了稳定、可复用、未来高概率再次出现的问题，就不应只停留在 result 里，而应提升为长期知识：

- 更新 `CLAUDE.md` 的高层合同（仅在真的影响项目总流程时）
- 更新 `rules/` 中的稳定规则
- 更新 `harness/specs/` 中的长期规范
- 必要时写入持久记忆，记录“为什么”和“以后怎么做”

### 归档后的关键问题

每次 result 或 change 归档后，至少要回答：

- 这次错误或返工，未来怎么避免？
- 这是局部事件，还是应该上升为长期规则？
- 是不是应该补模板、补 hook、补测试、补 reviewer、补 glossary？

如果归档不能改变未来的行为，它就只是存档，不是治理。

## 执行策略路线图（TDD / subagent / worktree）

当前 E2E 流程方向是正确的，但执行策略要分阶段推进。

### Phase 1：可运行优先

第一版可以不强制 worktree，但必须满足以下约束：

- 以单 writer / 串行修改为主
- TDD 仍然成立
- subagent 主要用于只读探索、设计审查、计划审查、代码 review
- 真正改代码时，避免多个 agent 同时修改同一工作区

这意味着第一版可以是：

- intake / design / plan 可使用多个 read-only subagent
- implementation 默认由主执行者串行完成，或一次只允许一个 mutating worker

### Phase 2：并行实现增强

当 implementation plan 已经足够稳定、任务可独立拆分时，应引入：

- subagent-driven TDD execution
- worktree isolation（或等价隔离执行方式）

适用场景：

- 多个独立文件/模块的并行改动
- 多个 slice 可独立推进
- 需要避免共享工作区冲突
- 需要并行 red-green-refactor 而不互相污染

### Worktree 策略结论

- **第一版不强制 worktree** 是合理的
- 但 **后续必须进入路线图**，否则并行可变更任务会越来越难控
- 对于非 git workspace，必须显式记录：当前无法用 worktree，因而 mutating tasks 采用串行策略
- 一旦进入 git 化或多 agent 并行实现阶段，worktree 应成为标准能力而不是可选附加项

### TDD 与 subagent 的关系

借鉴 Superpowers 的强项，但改造成 Harness 自己的执行标准：

- plan 中必须显式写出 RED → GREEN → REFACTOR 顺序
- 对可独立任务，允许 subagent 执行 TDD
- 对共享上下文强、修改面重叠的任务，默认单执行者串行 TDD
- reviewer 与 verification 必须独立于实现者视角，不能只相信“实现者说测过了”

## Anti-regret constraints（防后悔约束）

正式设计必须保留这些约束：

- Gate 强度随 change tier 变化。
- `CLAUDE.md` 保持紧凑。
- 一个事实只有一个 source of truth。
- 指令分层必须显式定义。
- 目录模型必须可验证。
- Self-review 必须要求 evidence，不能只有 checkbox。
- Hooks 保持快速；full verification 在 completion/commit 前运行。
- Waiver 必须显式、有人负责、且有时限。
- 工具选择只是更大能力模型的实现细节。
- Nested `CLAUDE.md` 只允许用于真实 service/module 边界。

## Three-month anti-regret additions（三个月防后悔补充）

以下补充项不是“锦上添花”，而是最可能在 1-3 个月内显著降低维护后悔的设计加固项。

### 1. Glossary（术语表）

增加：

```text
harness/specs/glossary.md
```

目的：把上游灵感来源中的术语彻底翻译为本项目自己的正式术语，避免三个月后出现一物多名。

建议内容：

| 上游或通用词 | 本项目正式术语 |
|---|---|
| brainstorming | Harness Scoping |
| exploration | Harness Exploration |
| spec self-review | Design Self-Review / Plan Self-Review |
| proposal | Harness Change Proposal |
| stable spec | Harness Stable Spec |
| business-step comments | 业务步骤注释 |

同时记录中英偏好表达，避免中文文档与英文代码之间的术语漂移。

### 2. Rule enforcement matrix（规则执行矩阵）

增加：

```text
harness/specs/rule-enforcement-matrix.md
```

目的：回答“这条规则由谁、在什么时候、通过什么方式执行”，避免同一规则同时散落在 `CLAUDE.md`、`rules/`、hooks、tests、reviewer 中而失控。

建议结构：

| 规则 | 来源文件 | 执行方式 | 何时执行 | Owner |
|---|---|---|---|---|
| domain 不依赖 infrastructure | `rules/architecture.md` | ArchUnit | full verification | Java governance |
| OpenAPI path 与 controller 对齐 | `rules/api-contract.md` | hook script | targeted validation | API governance |
| 复杂 orchestration 方法要有业务步骤注释 | `rules/java-style.md` | reviewer | code review | style reviewer |
| `CLAUDE.md` 必须保持紧凑 | `harness/specs/instruction-layering.md` | self-review + reviewer | doc review | platform governance |

### 3. Artifact lifecycle and status（产物生命周期与状态）

为长期文档增加状态元信息，防止文档发霉后仍被当成当前真相。

建议在 `rules/` 和 `harness/specs/` 中的长期文档使用 frontmatter：

```md
---
status: draft | active | superseded | archived
owner: platform-governance
last_reviewed: 2026-07-08
review_cadence: monthly | quarterly
supersedes: []
---
```

并且明确：

- `harness/explorations/` 是时间点证据，不是永久真理
- `harness/work/` 是活动工作，不是长期规范
- `harness/specs/` 才是稳定流程/能力规格

### 4. Async review path（异步评审路径）

同步对话式批准很适合当前一对一协作，但团队评审通常是异步的。

因此设计中应同时支持：

- **同步评审**：对话中逐步确认
- **异步评审**：把设计文件发给团队成员后再回收意见

为异步评审增加固定结构：

```md
## Review Questions
- 这个需求边界是否合理？
- 是否有过度设计？
- 是否缺少 API/data/testing 约束？
- 是否需要拆 slice？
- 哪些知识应进入长期规则而不是工作文档？
```

这样 reviewer 不需要猜“应该重点看什么”。

### 5. Golden path example（黄金路径样例）

规则再多，也不如一个完整样例更能帮助团队落地。

增加一个端到端样例，覆盖：

```text
requirement intake
→ exploration
→ docs lookup
→ AskUserQuestion
→ design
→ design self-review
→ plan
→ result
```

优先建议使用一个真实但规模不大的 Java service requirement，作为团队后续模仿的基准。

### 6. Tool availability fallback policy（工具不可用时的 fallback 策略）

当前设计依赖 codegraph、AskUserQuestion、Context7、内部 MCP、hooks、reviewer agents、以及未来的 ArchUnit/Checkstyle 等能力。

为了避免流程只在某一台机器上成立，必须定义不可用时的 fallback：

| 能力 | 不可用时策略 |
|---|---|
| codegraph | 记录 fallback read/search，并按 tier 判断是否阻塞 |
| Context7 | 改查内部文档或官方文档，并记录风险 |
| 内部 MCP | 记录 unavailable，并提升风险等级 |
| AskUserQuestion | 如果是异步/批处理场景且必须由用户决策，则停止推进，不允许硬猜 |
| ArchUnit | 若尚未接入，则在 implementation plan 中显式加入，而不是假装已 enforce |

### 7. Template pruning policy（模板精简机制）

随着时间推移，模板会不断增长。必须显式允许清理无效模板。

建议规则：

- 每个模板必须回答一个独立问题
- 重复模板应合并
- 90 天回看一次模板使用情况
- 没有实际使用价值或只制造噪音的模板可以删除

### 8. Definition of Done by artifact（按产物定义完成）

为主要产物定义完成标准：

| 产物 | Done 标准 |
|---|---|
| intake | 足以进入 design，不再依赖猜测 |
| design | 需求、边界、测试、风险、长期知识决策明确 |
| plan | 可执行、无 TODO/TBD、验证命令清楚 |
| result | 实际运行证据齐全，失败/跳过项透明 |

### 9. Review cadence and ownership（评审节奏与所有权）

长期规则如果没有 owner 和 review cadence，三个月后极易过期。

建议：

- `owner`：逻辑上谁负责这份规则/spec
- `last_reviewed`：最后一次确认仍有效的时间
- `review_cadence`：例如 monthly / quarterly

## 对后续 implementation planning 的产物影响

这个设计意味着后续 implementation plan 需要新增或更新以下产物：

```text
harness/specs/instruction-layering.md
harness/specs/directory-model.md
harness/specs/requirement-intake.md

rules/requirement-intake.md
rules/documentation.md
rules/java-style.md
rules/design.md

harness/templates/intake-template.md
harness/templates/exploration-template.md
harness/templates/exploration-checklist.md
harness/templates/intake-readiness-checklist.md
harness/templates/design-template.md
harness/templates/design-self-review-checklist.md

hooks/validate-spec-structure.sh
hooks/validate-architecture.sh
```

Root `CLAUDE.md` 只应接收短入口与最高层操作合同更新，不应承载完整细节。

## 对后续实现的验证策略

未来 implementation plan 应包含：

- 新目录 / template / spec 的结构校验
- template 与 rule 文件的 placeholder 扫描
- `reference-service/` 的 Maven tests
- ArchUnit test 的引入，或在依赖尚未加入前明确规划占位
- hook 执行证据
- 在 `result.md` 中记录实际运行命令与显式跳过项

## Design Self-Review

### 1. Requirement alignment

Verdict：通过。

Evidence：
- 设计覆盖了用户已确认的目标：把 harness 变成自己的企业流程，而不是直接沿用上游 Superpowers/OpenSpec 命名与结构。
- 已覆盖 memory/instruction layering、`AskUserQuestion`、条件 docs lookup、design self-review、Java architecture gates、style rules、nested `CLAUDE.md` 和 anti-regret constraints。

### 2. Scope and slice size

Verdict：通过。

Evidence：
- 本设计只定义目标流程和拟新增的产物。
- 已明确排除 CLI、installer、dashboard、cross-service orchestration 和 implementation changes。
- 实现被明确推迟到后续 plan 阶段。

### 3. Architecture boundaries

Verdict：就 design scope 而言通过。

Evidence：
- Java 架构 enforcement 被定义为未来的 ArchUnit tests，而不是当前直接改代码。
- 设计列出了高价值 Clean Architecture 检查点，但没有过早把所有命名和包结构锁死。

### 4. API and data impact

Verdict：通过。

Evidence：
- 这份设计本身不直接改变 API 或数据库。
- 它明确定义了未来 API/data 变化在何种情况下必须触发 docs lookup、design、OpenAPI impact analysis 和 verification。

### 5. Documentation evidence

Verdict：通过。

Evidence：
- 设计采纳了用户确认的“条件必查”文档策略。
- 它定义了 local repo evidence、enterprise docs、Context7/package docs、official docs 与 broader web search 的优先级。

### 6. Testing strategy

Verdict：就 design scope 而言通过。

Evidence：
- 设计明确区分了 fast hooks、targeted validation 与 full verification。
- 它建议使用 ArchUnit 管 Java 架构边界，使用 Checkstyle/PMD/formatter 管机械风格检查。

### 7. Ambiguity and assumptions

Verdict：通过。

Evidence：
- 设计记录了用户已选择的风格立场：`// 1. ...` 注释只应用于复杂 orchestration 方法。
- 它把 ArchUnit 依赖版本、Checkstyle/PMD 的具体选型留给 implementation planning，而不是假装当前已决定。

### 8. Failure modes and rollback

Verdict：通过。

Evidence：
- 设计加入了 anti-regret constraints、waiver handling、hook 权重控制和 change tiers，以降低流程失控风险。
- 当前阶段没有进行不可逆仓库修改。

### 9. Knowledge persistence

Verdict：通过。

Evidence：
- Root `CLAUDE.md`、nested `CLAUDE.md`、`rules/`、`harness/specs/`、`harness/templates/`、`harness/explorations/`、`harness/work/` 与持久记忆的职责边界已经分离。

### 10. Placeholder and contradiction scan

Verdict：通过。

Evidence：
- 文档中没有 `TBD` 或 `TODO` placeholder。
- 设计前后一致地把 implementation 推迟到 user review 和 implementation planning 之后。
- 文档前后一致地把 hooks 定义为机械检查，把 reviewer 定义为语义检查。

## Commit 状态

当前 workspace 不是 git 仓库，因此无法执行“提交设计文档”这一步。设计已本地保存，等待用户评审。