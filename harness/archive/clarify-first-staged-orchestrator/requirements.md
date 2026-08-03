# Requirements

## 原始需求

把当前 Enterprise Harness 收敛成一个面向 Claude Code 的单入口、可打断、自动推进的 staged workflow harness，吸收 superpowers 的 workflow/skill/subagent 经验，吸收 OpenSpec 的 durable artifacts/gate/source-of-truth 经验，并把强制澄清、ambiguity scoring、企业设计检查项、TDD 与 verify 收口统一起来。

## 澄清后的目标

- 用户统一从 `/harness` 作为主入口进入；阶段 skill 只作为 subordinate recovery entry
- workflow 以 `clarify -> route -> design -> plan -> tdd -> verify -> archive` 推进
- 需求澄清成为强制第一阶段
- 高噪声探索默认下沉为 read-only subagent
- `requirements/change/design/tasks/validation/reviews/state/evidence` 保持为 durable truth
- hooks 负责自动提示/阻断/恢复，不替代主编排器

## 范围

- Claude Code-only 的 repo-native 扩展面
- `.claude/skills` / `.claude/settings.json` / `.claude/agents` / `harness/*`
- staged workflow 规范、模板、阶段 skill、next-stage guidance、exploration/ambiguity contract

## 非目标

- 本轮不做多宿主 packaging-first 重构
- 不把 `harness/plugin/manifest.json` 升格为 Claude Code 官方 plugin API
- 不一次性完成全部 runtime 行为重写

## 关键参与者 / 用户 / 调用方

- Claude Code 会话中的最终用户
- `/harness` orchestrator
- clarify/route/design/plan/tdd/verify 阶段 skill
- read-only exploration / reviewer / verifier subagent
- runtime hooks / backend commands

## 业务上下文

当前仓库已经有：
- `/harness` 总入口雏形
- `.claude/settings.json` hooks
- `harness/changes/*` durable state
- validation freshness / reviewer gate 基础

当前目标不是发明全新系统，而是把这些已有能力收敛成 clarify-first staged workflow 产品形态。

## 约束

- 先只关注 Claude Code
- 适配企业常见 200k 级上下文上限
- 不能把聊天上下文当作唯一真相
- 不能弱化现有 freshness / review / change state 门禁

## 接口 / API 关注点

- `/harness` 作为单一入口与阶段路由器
- stage skill 作为 clarfiy/design/plan/tdd/verify 的子入口
- SessionStart / Stop / status 输出当前 stage 与恢复入口

## 数据 / SQL 关注点

- 本轮不改业务 SQL
- 但 `design` 阶段模板必须显式要求 SQL / 数据设计 section

## 验收标准

- 仓库内存在 staged workflow 稳定规范
- `requirements/design/tasks/validation` 模板具备 clarfiy-first / enterprise design / TDD / verify 必需 section
- `/harness`、`harness-intake`、阶段 skill 的 contract 与 staged workflow 对齐
- SessionStart / Stop / status 能提示当前 stage 与推荐恢复入口
- exploration packet / ambiguity scoring contract 已落盘并有 smoke 覆盖

## 歧义评分
- Goal clarity: 5
- Scope clarity: 4
- User/actor clarity: 4
- Data/SQL clarity: 4
- Interface/API clarity: 4
- Acceptance criteria clarity: 4
- Constraint/risk clarity: 4
- Overall: 4

## 当前最弱维度

- Scope clarity：当前仍需在后续实现中决定 `workflow.*` 与 legacy state 的协同消费细节，但 `/harness` 为唯一主入口、stage skill 为 subordinate recovery entry 的定位已锁定。

## 需要继续澄清的问题

- clarify-ready / plan-ready 等阶段状态后续是否需要更强的 machine-readable 表达
- `review` 是否长期独立为主阶段，还是继续并入 `verify`

## Repo / 文档事实依据

- `.claude/skills/harness/SKILL.md`
- `.claude/skills/harness-intake/SKILL.md`
- `.claude/settings.json`
- `harness/specs/staged-workflow.md`
- `harness/specs/session-lifecycle.md`
- `harness/plugin/runtime/hooks/session-start.mjs`
- `harness/plugin/runtime/hooks/stop.mjs`
- `harness/plugin/runtime/lib/status-summary.mjs`

## 用户确认
- 状态: confirmed-by-user-in-conversation
- 已确认范围: Claude Code-only clarify-first staged orchestrator，全局改造优先从规范、模板、stage skill、guidance 与 exploration contract 开始
- 备注: 用户明确同意继续推进，不再停留在入口讨论层面。