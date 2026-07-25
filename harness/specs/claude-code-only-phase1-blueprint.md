# Claude Code-only Phase 1 重构蓝图

## 目标

把 Enterprise Harness 收敛为一个 **Claude Code-only** 的 staged workflow 产品形态，并明确分层为：

- **编排层**：Claude Code 原生的 `/harness` + 阶段 skills
- **执行层**：专职 agents / subagents
- **接缝层**：Claude Code hooks / command backend adapters
- **原语层**：统一业务原语（workflow primitives）

本蓝图的重点不是“删掉所有脚本”，而是：

> 把编排权从 fat runtime 中拿出来，收回到 Claude Code 原生层；
> 同时保留不可避免的 hook 接缝层与统一业务原语层。

---

## 一句话原则

- `/harness` 决定当前阶段与下一步
- 阶段 skill 决定该阶段的 TECPC 方法论与用户引导
- agent 决定该阶段的专职执行
- hook 接缝层负责生命周期接入与机械阻断
- 统一业务原语层负责稳定状态变更、stage 推断、verdict/validation 消费

---

## 当前问题（为什么要重构）

当前仓库已经具备 staged workflow、门禁、change 资产和一批 smoke tests，但仍存在以下结构性风险：

1. `runtime` 一词过宽，容易让人误以为它是第二个 orchestrator
2. 同一套阶段语义分散在 `CLAUDE.md` / `README` / `skills` / `rules` / runtime helper / specs 中
3. agent 与 skill 的边界还不够清晰，TDD 仍未正式独立为专职 executor 角色
4. hook / state / verifier / docs 的关系是“已经能工作”，但不是“已经最容易解释和维护”
5. phase 1 还缺一份能指导后续重构的统一蓝图

---

## 目标分层

## 0. repo truth / durable assets 层（保留在 `harness/`）

### 负责什么
- `harness/specs/`：规范真相层
- `harness/templates/`：模板
- `harness/changes/`：活动 change 资产
- `harness/archive/`：归档资产
- `harness/plugin/runtime/`：动作层与统一业务原语

### 为什么这层必须保留
Claude Code-only phase 1 的目标是把**编排与交互**收口到 Claude Code，而不是物理上消灭 `harness/` 目录。`harness/` 继续承载 repo truth 与 durable assets，否则 staged workflow 会失去可恢复、可审计、可机械消费的状态落点。

## 1. 编排层（Claude Code 原生）

### 负责什么
- `/harness` 作为唯一前门
- 判断当前 stage
- 向用户显示 TECPC 卡
- 显示当前 gap / next entry / next action
- 决定是否需要问用户 / 是否需要派 agent
- 消费 agent 返回结果并推进阶段

### 不负责什么
- 直接维护复杂 backend 状态写入细节
- 隐式在脚本中推进大部分 workflow
- 自己承担所有高噪声探索和执行过程

### 主要载体
- `/harness`
- `/harness-intake`
- `/harness-design`
- `/harness-plan`
- `/harness-tdd`
- `/harness-verify`

---

## 1.5 探索能力层（CodeGraph / Context7）

### 负责什么
- **CodeGraph-first**：代码定位、调用链、影响面、跨模块传播
- **Context7-first**：外部库/框架/SDK/版本行为文档核实

### 当前映射
- `code-explore` ← CodeGraph
- `doc-research` ← Context7

### 为什么这是 phase 1 亮点
这两条探索 lane 不是“顺手带上的工具”，而是本项目在 Claude Code-only phase 1 中与普通 prompt 工作流拉开差距的重要能力：
- 代码探索不靠主对话乱 grep
- 文档探索不靠模型记忆乱猜
- clarify / route / design / verify 都有事实补盲通道

## 2. 执行层（专职 agent）

### 负责什么
- 窄任务、专职角色、上下文分割
- 返回压缩结论或结构化结果
- 不污染主对话

### 推荐角色
- `code-explore`
- `doc-research`
- `design-reviewer`
- `plan-critic`
- `verification-reviewer`
- **建议新增：`tdd-executor`**

### 为什么建议新增 `tdd-executor`
当前 TDD 是最关键、也最容易漂移的阶段之一。它已经具备独立角色特征：
- worktree 隔离
- 真实构建命令（如 `mvn test` / `mvn verify`）
- RED / GREEN / REFACTOR 子状态
- 结果摘要与 evidence 回传

因此不应长期挂靠在 `general-purpose` 上。

### 不负责什么
- 作为用户主入口
- 自己发明全局阶段推进逻辑
- 充当 durable state 的最终真相源

---

## 3. 接缝层（Claude Code hook / command adapters）

### 负责什么
- 接收 Claude Code 生命周期事件
- 调用统一业务原语
- 做不可绕过的机械阻断
- 将 deterministic backend actions 暴露给 command/skill 使用

### 这层是什么
这层就是此前常被统称为 “runtime” 的部分中，真正保留的 **Claude Code 宿主接缝层**。

### 包含什么
- SessionStart hook handler
- PreToolUse / PostToolUse / Stop hook handler
- status / verify / release / archive 等 command backend adapter

### 不负责什么
- 自己成为第二个 orchestrator
- 重复定义 clarfiy/design/plan/tdd/verify 的完整流程语义

---

## 4. 原语层（统一业务原语 / workflow primitives）

### 负责什么
- `loadActiveChange`
- `inferWorkflowStage`
- `recommendNextEntry`
- `recommendExplorationLane`
- `inferCurrentGap`
- `renderTECPCCard`
- `validateCompletionReviewers`
- verdict / validation / state mutation helper
- archive / release / package 的确定性动作辅助

### 这一层的地位
这是 phase 1 中最值得保留和强化的底层。它不是平台抽象层，而是：

> **统一业务原语层**

skill 和 agent 都不应该各自复制这些逻辑；应该由它们共同消费这一层。

### 不负责什么
- 不直接承担用户主交互
- 不自行决定高层产品叙事
- 不隐式替代 skill/agent 的阶段语义

---

## 单一真相原则

### 真相层
`harness/specs/` 是阶段 contract、边界说明和设计选择的真相层。

### 投射层
- `CLAUDE.md`：短地图与硬约束摘要
- `README.md`：用户导向摘要与导航
- `skill`：阶段方法论投射
- `agent`：专职执行 contract 投射
- `hook`：生命周期阻断投射
- `smoke test`：机械验证投射

### 禁止事项
- 不得让 skill 直接成为新的单一真相层
- 不得让 agent 自己复制完整 workflow 语义
- 不得让 hook/runtime 与 specs 各写一套阶段定义

---

## 建议保留 / 削薄 / 新增

## 保留
- `state.json` / `ACTIVE_CHANGE`
- `status-summary.mjs` / `workflow.mjs` / `gates.mjs` / `checks.mjs` 这类原语层 helper
- pre-explore / pre-write / stop 这类硬门禁
- release / verify / archive / package 这类确定性 backend action

## 削薄
- 任何重复定义完整 staged workflow 的 runtime 脚本
- 任何在文档中长篇重复 phase 1 理论而不提供新信息的段落
- 任何同时在 `CLAUDE.md` 和 deeper spec 中全文重复的架构解释

## 新增
- `tdd-executor` agent
- 更明确的阶段 contract（建议后续补 `tdd-execution.md` / `verify-contract.md`）
- 更明确的 double-check consumption contract

---

## Double-check 模型（建议明确化）

受 Superpowers 启发，phase 1 推荐把 double-check 固定成：

1. 主阶段 skill 组织当前工作
2. 专职 agent 执行/审查
3. reviewer verdict 落盘
4. verify 阶段统一消费 verdict + validation
5. stop gate 阻断未闭环完成态

这比“有 reviewer agent 就算 double-check”更可靠。

---

## 推荐的下一步重构顺序

### Step 1
统一文档层次：
- `CLAUDE.md` 摘要化
- deeper specs 承接设计复盘与边界说明

### Step 2
明确 skill / agent / hook / primitives 边界：
- skill 只写阶段方法论
- agent 只写专职执行
- hook 只保留机械门禁
- primitives 统一承载稳定动作

### Step 3
把 TDD 从 general-purpose 中抽成 `tdd-executor`

### Step 4
补独立 contract：
- `tdd-execution.md`
- `verify-contract.md`
- `double-check-model.md`

### Step 5
补对应 smoke：
- `tdd-executor-contract-smoke`
- `double-check-consumption-smoke`
- `spec-projection-consistency-smoke`

---

## Phase 1 完成态的验收标准

当以下条件成立时，可认为 Claude Code-only phase 1 基本成立：

- 普通用户只需 `/harness`
- 所有阶段恢复入口一致且可解释
- clarify / route / design / plan / tdd / verify 都有清晰 contract
- subagent 等待完全依赖 Claude Code 通知机制
- TDD 执行由专职 executor agent 承担
- 文档真相层不再分散复制
- hook 只做机械门禁，不再承担主要编排叙事
