# Agent / Skill / Hook / Runtime Boundary

## 目标

明确 Enterprise Harness 在 Claude Code-only phase 1 下的分层边界，避免：

- skill 和 agent 各写一套流程
- runtime 重新长成第二套编排器
- README / CLAUDE / spec / skill 重复定义阶段行为

## 一句话原则

- `/harness`：总前门与阶段编排入口
- `skill`：阶段方法论与用户可见引导
- `agent`：专职执行角色
- `hook/runtime`：机械门禁、durable state、确定性动作
- `spec`：单一真相层

## 各层职责

### 1. `CLAUDE.md`
负责：
- 愿景摘要
- 设计谱系摘要
- 当前架构原则
- 硬约束
- 深入文档导航

不负责：
- 展开完整阶段 contract
- 承载长篇设计复盘
- 复制所有 skill/rule 细节

### 2. `/harness` 与阶段 skills
负责：
- 当前阶段的 TECPC
- 当前缺口
- 阶段产物要求
- 该阶段需要派哪些角色 agent
- 当前阶段的恢复入口

不负责：
- durable state 的最终真相
- 完成态机械阻断
- release/package/archive 等确定性 backend 执行

### 3. agents
负责：
- 代码探索
- 文档调研
- review / critic / verification
- TDD 执行（建议由专职 executor agent 承载）
- 输出压缩结论，而不是污染主上下文

不负责：
- 作为用户前门
- 维护全局 workflow 状态机
- 替代 `/harness` 决定整体阶段推进

### 4. hooks / runtime（更准确地说：hook adapter + workflow primitives）
负责：
- `state.json` / `ACTIVE_CHANGE` / verdict / validation 的 durable truth
- PreToolUse / PostToolUse / Stop 的硬阻断
- scaffold / verify / archive / release / package 等确定性 backend 动作

不负责：
- 作为主要用户交互面
- 隐式承载完整 staged UX
- 取代 skill 层的 TECPC 阶段话术
- 被误解为“需要把 `harness/` 整体删掉”

### 5. CodeGraph / Context7 探索能力层
负责：
- `code-explore` 的 codegraph-first 代码事实探索
- `doc-research` 的 Context7-first 文档事实探索

不负责：
- 取代阶段 skill 的方法论说明
- 取代 repo truth / durable asset 层

### 5. specs
负责：
- 当前阶段 contract 的单一真相
- ambiguity scoring
- staged workflow
- 角色边界
- phase 1 / phase 2 范围说明

## 单一真相原则

任何阶段行为，优先由 `harness/specs/` 定义；其他层只做“投射”：

- skill 投射为用户可见引导
- agent 投射为专职执行 contract
- README / CLAUDE 投射为摘要说明
- smoke test 投射为机械验证

不得让同一条关键规则同时以 4 种不同表述长期并存。

## 推荐边界案例

### clarify 评分
- 真相层：`harness/specs/ambiguity-scoring.md`
- skill：如何向用户展示评分表
- agent：必要时做前置探索
- hook：不直接管理每轮评分文本

### TDD 执行
- 真相层：`harness/specs/staged-workflow.md` + 后续独立 `tdd-execution.md`
- skill：TDD 阶段为什么必须 RED/GREEN/REFACTOR
- agent：真实执行 `mvn test` / `mvn verify` / worktree
- hook：阻止主对话直接写生产代码 / 缺 RED 证据改生产代码

### 完成态保护
- 真相层：verify / review consumption contract
- skill：向用户说明 verify 阶段要消费什么
- agent：verification-reviewer 输出 verdict
- hook/runtime：Stop / verify 机械阻断 stale completion

## 反模式

### 反模式 1：skill 自己定义完整真相
后果：README、agent、runtime 很快漂移。

### 反模式 2：agent 自己发明流程
后果：角色失焦，double-check 变形。

### 反模式 3：hook 承担主编排
后果：行为隐蔽、难调试、难解释。

### 反模式 4：spec 只是历史参考
后果：仓库重新回到“多层都像真相，实际没有真相”。
