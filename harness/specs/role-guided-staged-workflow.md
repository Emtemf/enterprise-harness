# Role-Guided Staged Workflow 草案

## 目标

在不破坏当前 **clarify-first** 方法论的前提下，引入更贴近企业协作的角色参与模型，让 staged workflow 不只是阶段序列，还能表达：

- 谁主导当前阶段
- 谁参与评审或补充事实
- 哪个 artifact 是阶段交接物
- 哪些确认必须来自人类用户

本草案是对 `staged-workflow.md` 的补充，而不是替代。

## 核心原则

### 1. 角色是视角，不是戏服

本仓库引入角色视角，是为了帮助 orchestrator 更自然地组织澄清、设计、计划、实现与验收。

它不意味着每次都要显式“扮演”多个角色，也不要求把每一轮交互都表演成多人会议。

### 2. clarify-first 方法论保持不变

本仓库已有的 clarify 能力必须保留，不能因为引入角色化流程而退化成僵硬问卷：

- 苏格拉底式提问
- ambiguity scoring
- weakest-dimension targeting
- 先探索，再问用户
- 必要时做轻量头脑风暴 / 多方案发散
- 达到 clarify-ready 且用户确认后才进入 route

角色化流程只能增强“谁主导当前阶段”，不能削弱“如何澄清需求”。

### 3. 流程是减负，不是加负

角色化的目标，是让普通用户和下游执行者更少猜测，而不是制造更多 ceremony。

普通用户仍然只需要知道：

1. 安装 `enterprise-harness`
2. 打开 Claude Code
3. 输入 `/harness`

## 角色与阶段映射

### 用户（human user）

职责：
- 输入原始需求
- 回答澄清问题
- 确认执行范围
- 参与最终业务验收

默认参与阶段：
- `clarify`
- `verify`

### Product Owner 视角

职责：
- 把用户原始需求收敛为可执行需求
- 锁定 MVP / 范围 / 非目标
- 保证需求表达和验收标准可被后续阶段消费

主导阶段：
- `clarify`
- `route`

阶段交接物：
- `requirements.md`
- `change.md`
- `state.json`（最低 route 信息）

### Principal Architect 视角

职责：
- 把需求变成可评审的架构设计
- 明确接口、数据/表、状态流、边界和风险
- 与开发、测试共享统一设计基线

主导阶段：
- `design`

阶段交接物：
- `design.md`

### Fullstack Developer 视角

职责：
- 把 design 变成开发详细设计与执行切片
- 负责代码层 touched files、最小实现路径、RED/GREEN 顺序
- 在 TDD 阶段进行最小实现与重构

主导阶段：
- `plan`
- `tdd`

阶段交接物：
- `tasks.md`
- 测试与实现代码
- RED/GREEN/REFACTOR 证据

### Quality Engineer 视角

职责：
- 提前介入设计和计划，确保验收边界可测试
- 审视异常场景、边界条件、验证证据与跳过项
- 在 verify 阶段主导完成声明的质量检查

主导阶段：
- `verify`

重点参与阶段：
- `design`
- `plan`
- `tdd`

阶段交接物：
- `validation.md`
- `reviews/*.json`

## 阶段解释（角色化版本）

### clarify

主导角色：
- Product Owner 视角

参与角色：
- 用户
- 必要时 Architect / QA 补高风险事实

目标：
- 从“用户一句话”推进到 clarify-ready
- 保持苏格拉底式澄清、ambiguity scoring 与 weakest-dimension 驱动

最低产物：
- `requirements.md`

### route

主导角色：
- Product Owner + Principal Architect 视角

目标：
- 形成 final tier / impact / owner / next stage

最低产物：
- `change.md`
- `state.json`

### design

主导角色：
- Principal Architect 视角

参与角色：
- Developer
- Quality Engineer
- 必要时用户做边界确认

目标：
- 形成可评审的接口设计、表/数据设计、状态流与架构设计

最低产物：
- `design.md`

设计阶段必须按 TECPC 五维组织，显式覆盖：
- T 目标（业务目标 + 成功标准）
- C 上下文（探索事实 + 影响矩阵）
- E 证据（决策依据 + 测试策略 + 验证命令）
- P 路径（方案对比 + 接口/数据/架构设计 + 纠正预案）

### plan

主导角色：
- Fullstack Developer 视角

参与角色：
- Quality Engineer

目标：
- 形成开发详细设计 / 代码级执行切片
- 不只是任务列表，而是实现顺序、RED/GREEN 路线和 acceptance 设计

最低产物：
- `tasks.md`

### tdd

主导角色：
- Fullstack Developer 视角

参与角色：
- Quality Engineer

目标：
- 严格执行 TEST_WRITTEN → RED_VERIFIED → GREEN_VERIFIED → REFACTOR_VERIFIED

最低产物：
- 测试 / 实现代码
- `validation.md` 中的阶段证据

### verify

主导角色：
- Quality Engineer 视角

参与角色：
- Developer
- Architect
- 用户（最终业务验收）

目标：
- 统一消费 reviewer verdict、validation freshness、命令证据、skipped items
- 形成可宣称完成的收口结论

最低产物：
- `validation.md`
- `reviews/*.json`
- `state.json`

### archive

主导角色：
- 系统 / maintainer

目标：
- 将完成态 change 正式归档

## Design 与 Plan 的边界（必须守住）

### design 是什么

`design` 不是高层口号，也不是 TODO 列表。

它更像：
- 架构师给开发和测试讲清楚需求与方案
- 说明接口如何设计
- 说明表/数据如何设计
- 说明状态与调用流程如何组织
- 说明风险与回滚策略

### plan 是什么

`plan` 不是重复 design。

它更像：
- 开发详细设计
- 代码级切片拆解
- touched files / implementation order
- RED / GREEN 证据点
- acceptance checks

如果 design 和 plan 混在一起，后续阶段会同时失去：
- 可评审架构交接物
- 可机械执行的开发切片

## 用户确认的最小原则

不要把每个阶段都变成形式主义确认。

默认只保留两类强确认：

### 1. clarify 结束时

用户必须确认：
- 执行范围
- 关键假设可接受
- clarify 结果可以进入 route/design

### 2. verify 阶段

用户可参与：
- 最终业务验收
- 是否接受当前交付结果

其余阶段尽量由内部 gate、artifact 与 reviewer 处理，而不是反复把确认负担甩给用户。

## 课程 / 语料吸收原则

若后续吸收课程资源（如 `role-workbench/corpus/raw-source`），应放入：
- reference / corpus / learning 层
- 或 workflow 方法论说明层

不应直接混入当前 runtime/change contract。

优先吸收的是：
- 方法论
- 角色协作方式
- design / plan / verify 的高质量结构

而不是把原始课程文本直接塞进当前 active change 的实现范围。

## 反模式 / Guardrails

### 反模式 1：把角色做成表演

错误形态：
- 每个阶段都强制切角色口吻
- 所有交互都模拟多人会议

正确形态：
- 用角色视角强化阶段职责
- 不做无意义角色表演

### 反模式 2：把 clarify 退化成问卷

错误形态：
- 固定问卷
- 不做探索
- 不看 weakest dimension

正确形态：
- clarify-first 保持不变
- 角色化只是补强主导关系

### 反模式 3：让流程比需求还重

错误形态：
- 小需求也被迫走满所有 ceremony
- 资产只为过 gate 而写

正确形态：
- 流程帮助降低猜测
- 资产帮助阶段交接与验证

### 反模式 4：重新把 design / plan 混掉

错误形态：
- design 写成空话
- plan 退化成 todo 列表

正确形态：
- design 负责架构/接口/表/测试策略
- plan 负责开发详细设计 / 执行切片

## 与当前 staged workflow 的关系

本草案是：
- 对 `staged-workflow.md` 的角色化补充
- 对 `design.md` / `tasks.md` 模板语义的增强说明
- 对 future role-guided workflow change 的先行结构草案

它不自动替代现有规范，也不要求当前 active change 立刻吸收全部内容。

## 建议后续吸收落点

后续若正式吸收，可优先修改：

1. `harness/specs/staged-workflow.md`
2. `harness/templates/design.md`
3. `harness/templates/tasks.md`
4. `.claude/skills/harness-intake/SKILL.md`
5. `.claude/skills/harness-design/SKILL.md`
6. `.claude/skills/harness-plan/SKILL.md`
7. `.claude/skills/harness-tdd/SKILL.md`
8. `.claude/skills/harness-verify/SKILL.md`

## 一句话总结

角色化流程值得引入，但必须建立在当前 clarify-first 方法论之上：

> 角色是视角，不是戏服；流程是减负，不是加负；clarify-first 不能丢。
