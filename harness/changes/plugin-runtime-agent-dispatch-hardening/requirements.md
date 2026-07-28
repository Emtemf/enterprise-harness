# Requirements（闭环五检驱动）

## T 目标

### 原始需求

按 Claude Code 官方插件、skills、subagents 与 hooks 规范，修复 Enterprise Harness 中
`/harness` 入口和 subagent 驱动不可靠的问题，完成代码修改、真实验证并提交。

### 澄清后的目标

本 change 冻结为 P0 运行面修复：

1. plugin-only 环境的 canonical 入口是 `/enterprise-harness:harness`，必须加载真实 orchestrator
   skill，不得命中说明型同名 command；源码仓库作为 standalone `.claude/` 使用时保留裸
   `/harness`。不承诺插件安装后存在官方未提供的裸 alias。
2. 所有 plugin-facing Agent 派发必须使用确定性的 `enterprise-harness:<agent>` subtype，
   reviewer artifact 中的逻辑 `reviewerId` 保持不变。
3. hooks 必须区分主 orchestrator 与 `code-explore` / `tdd-executor`，主线程不得因手填
   codegraph 状态而获得业务代码探索或生产写入权限。
4. 受治理写入必须累计消费 clarify、route、design、plan、CodeGraph、RED 证据，不得信任
   单一 `workflow.stage`。
5. TDD 完成证据必须来自存在且可校验的 receipt，至少绑定 task、agent、worktree、命令 argv、
   exit code、时间与 RED→GREEN→REFACTOR 顺序；字符串 `"mvn test"` 不再足够。
6. archive 必须复用完成态校验，不得只凭 `state=VALIDATED` 移动目录。
7. marketplace/plugin/package/runtime 版本投影必须一致，PR/release 必须运行确定性 P0 smoke。
   本 change 在本机 Claude 已安装且已认证的前提下必须运行 authenticated clean-target live
   E2E；CI 无凭据时只运行 deterministic gate，并通过显式环境开关启用 live E2E。
8. Agent 派发与完成证据必须消费 Claude Code 官方事件语义：
   - Agent `PreToolUse` 记录 requested scoped subtype 与 `tool_use_id`；
   - `SubagentStart` 记录 scoped `agent_type`、`agent_id`、`session_id`，该事件不可阻断；
   - subagent 内部工具事件用 `agent_id` 回查已登记身份，不假设通用工具事件含 `agent_type`；
   - `SubagentStop` 校验 `agent_id`、scoped `agent_type`、`agent_transcript_path` 与结构化结果，
     malformed packet 通过 `decision=block` 反馈给 subagent，且尊重 `stop_hook_active` 防循环；
   - `tdd-executor` agent frontmatter 必须声明 `isolation: worktree`。Claude 默认 worktree
     创建行为不应被自定义 `WorktreeCreate` hook 替换；receipt 以 start/stop cwd、git HEAD
     与真实 runner 输出证明 worktree，而不是相信 worker 文本。

### 成功标准

- clean plugin-only fixture 不再存在 command/skill canonical name 冲突；plugin 只验收
  `/enterprise-harness:harness`，standalone source checkout 验收 `/harness`。
- dispatch contract 中不存在 bare plugin agent subtype 或 `general-purpose` fallback。
- stream-json 与 hook ledger 可观察到 requested scoped subtype、匹配的 start/stop `agent_id`
  和 scoped `agent_type`。
- 主线程业务 Read/Bash 探索被拒绝；`code-explore` 的 CodeGraph-first/fallback 可被识别。
- 缺少前序 artifact 的伪 `stage=tdd` 写入被拒绝。
- 不存在或字段不完整的 TDD receipt 被 verify 拒绝。
- 不满足 completion predicate 的 VALIDATED change 无法归档。
- `claude plugin validate .` 零 warning。
- 新增 P0 smoke、现有关键 smoke、runtime verify 与本机 authenticated clean-target live probe 通过。

## C 上下文

### 业务上下文

当前仓库已经形成完整 staged workflow 规范，但真实插件运行面仍可能加载错误入口、使用错误
Agent subtype，且多个 gate 接受可手填的 projection。企业使用者因此看到“必须 subagent/TDD”
的承诺，却得到随机不派发、随机 BLOCK 或伪完成。

### 技术约束

- Claude Code 当前验证版本：`2.1.220`。
- plugin skill/agent canonical name 使用 `enterprise-harness:` namespace。
- `SubagentStart/Stop.agent_type` 对 plugin agent 是 scoped identifier；通用 hook 事件只有在
  subagent 内运行时携带 `agent_id`。运行时必须通过持久 receipt 将两者关联。
- CodeGraph CLI/MCP 与索引当前健康；Markdown/frontmatter 不在 CodeGraph 主要语义覆盖内，
  允许记录范围后 fallback 到 `rg`/Read。
- 不新增 fat runtime orchestrator：skill 仍负责 Agent 编排，runtime/hook 负责状态原语、证据和阻断。
- 本轮不修改 `reference-service` 业务代码。

### 关键参与者

- 普通使用者：standalone source checkout 从 `/harness` 进入；marketplace/plugin 安装后从
  canonical `/enterprise-harness:harness` 进入。
- 主 orchestrator：只负责编排和消费压缩结果。
- `code-explore`：唯一业务代码探索执行者。
- `tdd-executor`：唯一受治理实现执行者。
- reviewer agents：提供绑定 artifact digest 的独立 verdict。

### 非目标

- 不重写完整产品为 Node.js 自动 Agent runner。
- 不在本轮扩展全部企业 DFX/design 模板。
- 不发布 GitHub Release、不 push 远端。
- 不承诺抵抗拥有同一 OS 用户权限的恶意篡改；receipt 首版目标是阻止弱模型自报和流程误操作。

### P0 范围授权说明

用户明确要求修复 subagent 驱动、每阶段自检/其他检查、澄清歧义门禁、真实 Maven/TDD 与 hooks，
并进一步要求“按 Claude Code 的要求规范来修复，然后提交代码”。本 P0 将 entry、dispatch、
agent-aware hook、TDD receipt、archive completion 与 release acceptance 视为该目标的必要
运行闭环，而不是额外产品功能。若实现发现需要新增外部服务、发布远端或修改业务代码，则停止并
重新请求授权；当前均不涉及。

## E 证据

### 探索发现

- CodeGraph：`status`、`query/callers/impact recommendExplorationLane`、
  `query/impact buildWorkflowResult`、`query loadActiveChange/isGovernedTarget/checks/cmdArchive`。
- 官方文档：
  - `https://code.claude.com/docs/en/plugins`
  - `https://code.claude.com/docs/en/slash-commands`
  - `https://code.claude.com/docs/en/sub-agents`
  - `https://code.claude.com/docs/en/hooks`
- plugin-only baseline probe 已证明 scoped subtype 可派发，同名 command 会遮蔽 orchestrator；
  命令与结果摘要已落到 `evidence/plugin-live-baseline.md`。

### 歧义评分

| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| T 目标 clarity | 5 | 用户明确要求按 Claude Code 规范修复并提交 |
| Scope clarity | 5 | P0 运行闭环与非目标、授权推导边界均已冻结 |
| User/actor clarity | 5 | 普通用户、orchestrator、explorer、executor、reviewer 角色明确 |
| Data/SQL clarity | 5 | 本 change 无业务数据/SQL 影响，明确为 N/A |
| Interface/API clarity | 5 | canonical entry、事件身份关联、receipt/Agent subtype 已明确 |
| Acceptance criteria clarity | 5 | 已定义 deterministic smoke、live E2E 与完成态反例 |
| Constraint/risk clarity | 5 | 已识别 namespace、事件字段、worktree、旧缓存、hook 并行与 Bash 写面 |
| **Overall** | 5.0 | 七维平均值，所有适用维度均不低于 4 |

### 当前最弱维度

无低于 5 的维度。首批仍限制为入口、scoped dispatch、agent-aware gate、可信 TDD receipt、
archive/release acceptance；完整 receipt hash chain 与 FSM v4 深化不在本 change。

## P 路由

### 初步路由

- tier：L3
- 路由理由：跨 plugin 入口、skills、agents、hooks、runtime state/evidence、archive 与 release CI，
  且错误会破坏整个治理可信度。
- owning module / service：Enterprise Harness Claude Code plugin/runtime。

### 影响矩阵

| API | Data | Architecture | Rule |
|-----|------|-------------|------|
| no | no | yes | yes |

### 需要确认的决策

已由用户确认：按 Claude Code 官方规范修复并提交。结合用户前一轮明确提出的 subagent、自检、
歧义评分、真实 Maven/TDD 和 hooks 目标，首批采用本 requirements 的 P0 运行闭环边界。

### 假设

- 当前 Claude Code 2.1.220 的 hook payload 与官方文档一致。
- authenticated live E2E 可在本机运行；CI 中保持显式 opt-in，避免无凭据环境误失败。

## 最终路由

L3：进入 design → independent review → plan → subagent TDD → verify → archive。

## 需要继续澄清的问题

无阻断问题。

## 用户确认

- confirmed: true
- source: 用户消息“那你按照claude code的要求规范来修复，然后提交代码修复吧”
- confirmedAt: 2026-07-28
