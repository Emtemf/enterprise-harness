# Claude Code-only Phase 1

## 目标

把 Enterprise Harness 的第一阶段产品形态明确收敛为 **Claude Code-only**：

- 先把 Claude Code 内部的 staged workflow、TECPC、恢复入口、review/verify 闭环打透
- 先验证单平台交互与门禁的一致性
- 暂不优先追求跨平台 host 兼容

## 为什么先做这一阶段

当前仓库面临的主要风险，不是“还不能跨平台”，而是：

- 规则在 `CLAUDE.md` / `README` / `skills` / `rules` / `specs` / runtime 中重复表达
- 恢复入口、阶段感、等待机制、double-check 容易漂移
- 用户可见工作流与机械门禁之间有时脱节

因此 phase 1 的目标是：

1. 统一前门
2. 统一阶段语义
3. 统一恢复入口
4. 统一 reviewer / verify 消费方式
5. 统一文档真相层

## 当前范围

### 用户前门
- 只有 `/harness`

### 阶段恢复入口
- `clarify` / `route` → `/harness-intake`
- `design` → `/harness-design`
- `plan` → `/harness-plan`
- `tdd` → `/harness-tdd`
- `verify` → `/harness-verify`
- `archive` / 未识别 → `/harness`

### 重要澄清：Claude Code-only 不等于删除 `harness/`
Claude Code-only phase 1 的含义是：
- **交互前门、阶段编排、用户体验** 收口到 Claude Code 原生机制
- **repo truth、durable assets、templates、changes、archive、actions/primitives** 仍保留在 `harness/`

因此，phase 1 不是把所有东西都挪进 `.claude/`，而是：
- `.claude/` 负责前门、skills、agents、rules、hooks 配置入口
- `harness/` 负责 specs、templates、changes、archive、脚本动作与统一业务原语

### 主要承载层
- `CLAUDE.md`：短地图 + 承重墙 + 导航
- `.claude/skills/`：阶段方法论与用户可见引导
- `.claude/agents/`：专职执行角色 / reviewer / explorer
- `.claude/settings.json`：Claude Code hooks 配置入口
- `harness/specs/`：规范真相层
- `harness/changes/`：durable change 资产
- `harness/templates/` / `harness/archive/`：长期保留的 repo contract 资产
- `harness/plugin/runtime/`：hook 接缝层与统一业务原语/动作层

## 不在 phase 1 内优先解决的事情

- 多 host / 多客户端兼容抽象
- 脱离 Claude Code 的完整交互编排体验
- headless orchestration 的最终形态
- 统一的跨平台插件适配层

## 设计原则

### 1. 交互优先收口到 Claude Code 原生机制
- slash/skill 负责前台体验
- agent 负责上下文分割与专职执行
- hook 负责不可绕过的硬阻断

### 1.5 双探索通道是 phase 1 亮点，不是附属工具
- **CodeGraph-first**：代码探索默认走 `code-explore` + codegraph MCP/tooling
- **Context7-first**：文档探索默认走 `doc-research` + Context7 query path
- 这两条 lane 共同构成 phase 1 的“探索能力面”
- 它们不是可有可无的工具，而是 staged workflow 在 clarify / route / design / verify 中补事实的核心手段

### 2. 机械门禁继续保留
即便 phase 1 强调 Claude Code 原生体验，也不把这些能力退化成纯 prompt 约束：
- durable state
- pre-explore / pre-write / stop gate
- reviewer verdict 消费
- validation freshness 校验
- release/package/archive 等确定性 backend 动作

### 3. 文档采用渐进式披露
- `CLAUDE.md` 放摘要与硬约束
- `harness/specs/` 放当前可消费真相
- `harness/upstream/` 与扩展说明放来源和复盘

## Phase 2（后续）

在 phase 1 验证稳定后，再考虑：

- 把 Claude Code 交互壳与可迁移核心分开
- 抽离 host-neutral state / validation / review consumption core
- 为 Claude Agent SDK / headless / CI 场景建立兼容层

## 验收口径

当以下条件同时成立时，phase 1 算基本成功：

- 用户从 `/harness` 进入后，阶段感清晰
- 恢复入口在 skill / status / stop / README 中一致
- clarify / design / plan / tdd / verify 各阶段都有可测 contract
- subagent 等待不再轮询刷屏
- reviewer / verify / stop 能形成完成态闭环
- 文档真相层不再到处复制同一套长说明
