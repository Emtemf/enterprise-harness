# Design（闭环五检驱动）

## Role Ownership

- 主导角色：Principal Architect
- 参与角色：Claude Code Plugin Engineer / Quality Engineer / Human User
- 本阶段交接物：供 `plan-critic` 与 `enterprise-harness:tdd-executor` 消费的实现契约

## T 目标

### 业务目标

让 Enterprise Harness 的强规范在 Claude Code plugin-only 运行面真实成立：入口不会被同名
command 遮蔽，Agent 派发和身份可观察，主线程不能靠手填 projection 绕过探索/写入门禁，
TDD 只能由真实 runner 产生 RED→GREEN→REFACTOR receipt，完成态与发布验收共享同一组证据。

### 成功标准

- standalone `/harness` 与 plugin `/enterprise-harness:harness` 各自只有一个权威实现。
- plugin-facing Agent tool 只使用 `enterprise-harness:<agent>`，逻辑 lane/reviewer id 不变。
- Agent dispatch、SubagentStart、subagent 工具调用、SubagentStop 可按 `agent_id` 关联。
- 受治理写入累计检查所有前序 artifact/approval，不信任单一 stage。
- `tdd-run` 真实执行项目原生命令并记录退出码；伪字符串或不存在的 evidence path 失败。
- archive、prepublish、release 与 clean-target live E2E 有可执行 gate。

## C 上下文

### 当前状态（Evidence-based）

- `.claude-plugin/commands/harness.md` 与 `.claude/skills/harness/SKILL.md` 暴露同名入口；
  clean plugin-only baseline 实际命中说明型 command。
- 六个 `harness*` skill 中的 Agent 调用仍使用 bare subtype；仓库本地 `.claude/agents`
  会掩盖 plugin-only 的 scoped-name 要求。
- `pre-explore.mjs` 通过可手填的 `tooling.codegraph` 解锁主线程。
- `pre-write.mjs` 按 inferred stage 分支检查，显式 `stage=tdd` 会跳过前序 artifact 检查；
  matcher 也未覆盖 `NotebookEdit` 和 Bash 写面。
- `hasCurrentTaskTddExecutionEvidence()` 只检查字符串/布尔值，evidence path 不必存在。
- `cmdArchive()` 只检查 `state=VALIDATED`。
- marketplace 仍投影 `0.1.9`，其余 runtime/plugin/package 为 `0.2.29`；release 脚本不更新
  marketplace，也不先执行 P0 acceptance。
- `bin/enterprise-harness.mjs` 从目标项目 cwd 解析 `harness/plugin/runtime/cli.mjs`，因此
  clean plugin-only 目标尚未 sync runtime 时 portable backend 命令会失败。
- CodeGraph 索引健康：182 files / 3074 nodes / 4940 edges；语义承重点是
  `gates.mjs`、`checks.mjs`、`workflow.mjs` 与 `lifecycle.mjs`。
- Claude Code 官方契约：
  - standalone skill 使用裸名，plugin skill 始终 namespaced；
  - plugin subagent 的 Start/Stop `agent_type` 是 scoped identifier；
  - 通用 hook 只在 subagent 内携带 `agent_id`；
  - `SubagentStart` 不可阻断，`SubagentStop` 可以 block malformed result；
  - `isolation: worktree` 让 subagent 命令在临时 worktree 执行。

### 影响矩阵

| 层 | 受影响文件 | 影响类型 |
|----|-----------|---------|
| Plugin interface | `.claude-plugin/plugin.json`, command/skills/agents | canonical entry、scoped subtype、worktree isolation |
| Portable launcher | `bin/enterprise-harness.mjs` | 从 plugin install root 定位 runtime、以目标 cwd 执行 |
| Hook adapter | `hooks/hooks.json`, `.claude/settings.json`, `runtime/hooks/*` | Agent lifecycle、explore/write authorization |
| Runtime domain | `runtime/lib/agent-evidence.mjs`, `tdd-receipts.mjs`, `gates.mjs`, `checks.mjs` | identity、receipt、completion predicate |
| Runtime application | `cli.mjs`, `tdd-run.mjs`, `lifecycle.mjs` | authoritative command execution 与 archive |
| Release | marketplace、`bin/release.mjs`、prepublish/workflows | version projection 与 acceptance |
| Tests | `runtime/test/*hardening*.mjs` 及现有 smoke | RED/GREEN/对抗性/live E2E |

### 兼容约束

- 不把 logical `code-explore` lane 或 `reviewerId` 改成 scoped id。
- Claude plugin 结构官方契约会把 plugin root `bin/` executable 加入 Bash `PATH`。plugin
  skills 的 backend 命令先执行 `command -v enterprise-harness`，找不到即明确 BLOCK 并提示
  reload/update，不能静默回退目标 cwd；standalone source checkout 才使用
  `node harness/plugin/runtime/cli.mjs`。portable bin 必须相对自身 `import.meta.url` 找
  runtime，不能相对目标 cwd 找脚本。deterministic launcher smoke 与 clean live E2E 都要
  证明该 PATH/定位行为，不只依赖文档假设。
- strict/legacy 不由可手改的 state 字段决定。一次性 migration 创建 runtime-owned
  `harness/evidence-policy.json`，记录 `strictByDefault=true`、`legacyBaselineCommit`、
  当时已存在且已提交的 `legacyChangeIds` 与 canonical-content digest。只有在 baseline commit
  中可用 `git cat-file` 证明已经存在的 change 才能进入 legacy；本 change 在 baseline 中
  不存在，因此不能被加入。
- 保持 state schemaVersion=3；本轮不引入完整 FSM v4/hash-chain migration。
- hooks 写入的 receipt 是 runtime-owned 资产，模型工具不得直接覆盖。

## E 证据

### 设计决策依据

| 决策 | 证据来源 | 置信度 |
|------|---------|--------|
| 删除同名 flat command，以 skill 为唯一 plugin 入口 | Claude Plugins docs；live baseline | 高 |
| Agent tool 使用 scoped subtype，逻辑 id 不变 | Claude Subagents docs；plugin-only probe | 高 |
| 用 `agent_id` 将通用 tool hook 回查到 Start receipt | Claude Hooks common fields + SubagentStart/Stop | 高 |
| 不注册 WorktreeCreate，只给 executor 声明 isolation | Claude WorktreeCreate 会替换默认 git 行为 | 高 |
| runtime 自己 spawn 命令并写 receipt | Bash hook response 不能可靠替代进程 exit code | 高 |
| 新 change strict、旧 change legacy | 全仓历史 state 兼容与本轮非目标 | 高 |
| completion predicate 被 verify/archive 复用 | CodeGraph callers/impact of checks/lifecycle | 高 |

### 接口设计

#### 1. Agent identity / lifecycle receipt

新增 `harness/plugin/runtime/lib/agent-evidence.mjs`，持久化：

运行中先写所有 worktree 共享的 git common-dir spool：

`.git/enterprise-harness/receipts/<change-id>/agent-events.jsonl`

`SubagentStop` 后由主 checkout 的 `evidence-import` 原子校验并导出到 durable asset：

`harness/changes/<change-id>/evidence/runtime/agent-events.jsonl`

最小事件：

```json
{
  "receiptVersion": 1,
  "kind": "dispatch|start|codegraph-attempt|tdd-run-request|stop|violation",
  "changeId": "change-id",
  "sessionId": "session-id",
  "toolUseId": "toolu-id-or-null",
  "agentId": "agent-id-or-null",
  "requestedAgentType": "enterprise-harness:code-explore",
  "observedAgentType": "enterprise-harness:code-explore",
  "cwd": "/absolute/worktree/path",
  "commandDigest": "sha256-or-null",
  "transcriptDigest": "sha256-or-null",
  "issuedAt": "ISO-8601"
}
```

约束：

- known bare subtype（如 `code-explore`）在 Agent `PreToolUse` 被拒绝；
  其他项目自有 agent 不受影响。
- scoped dispatch 写 `dispatch`；Start 先以 `agent_id + observedAgentType` 建立身份。
  当前官方 plugin event 应返回 scoped type；为兼容旧宿主，logical frontmatter name 可归一为
  同一 scoped type，但 ledger 同时保留 requested/observed 原值，不能覆盖观察事实。
- Agent `PostToolUse.tool_response.agentId` 提供确定关联：用同一 `tool_use_id` 把 dispatch
  与具体 `agent_id` 绑定。前台完成与后台 `async_launched` 都有 `agentId`；并发同类型 Agent
  不靠“最近一次 start”猜测。最终 completion 必须存在这条 dispatch binding。
- `pre-explore` 对业务探索：
  - 无 `agent_id`：BLOCK；
  - `agent_id` 未关联到 active `enterprise-harness:code-explore`：BLOCK；
  - CodeGraph 工具/CLI 首次调用：允许并记录 attempt；
  - fallback Read/Grep/Glob/Bash：同 agent 没有 attempt 时 BLOCK。
- `SubagentStop`：
  - code-explore 必须包含结构化 Exploration Packet 章节；
  - tdd-executor 必须包含 task/worktree/commands/receipt refs；
  - malformed 且 `stop_hook_active=false` 返回 `decision=block`；
  - `stop_hook_active=true` 时记录 violation 后放行，避免无限循环。

#### 2. Authoritative TDD receipt

新增命令：

```text
node harness/plugin/runtime/cli.mjs tdd-run \
  <change-id> <task-id> <red|green|refactor> -- <command> [args...]
```

执行器使用 `spawnSync(command, args, { shell: false })`，只接受 `tasks.md` 中该 task 声明的
project-native command。Agent Bash 的 PreToolUse 先写 `tdd-run-request`，执行器必须找到
同 change/task/phase/cwd/command digest 且属于 active scoped `tdd-executor` 的 request。

执行期间写入所有 worktree 共享的 git common-dir spool：

`.git/enterprise-harness/receipts/<change-id>/tdd/<task-id>.json`

主 orchestrator 集成 executor commit 后运行：

```text
node harness/plugin/runtime/cli.mjs evidence-import <change-id> <task-id>
```

importer 必须验证 spool digest、已完成且已绑定的 tdd-executor agent、phase 顺序、
worktree `gitCommonDir`、`HEAD` 与 patch/tree digest，然后原子复制为：

`harness/changes/<change-id>/evidence/tdd/<task-id>.json`

```json
{
  "receiptVersion": 1,
  "changeId": "change-id",
  "taskId": "task-id",
  "agent": {
    "id": "agent-id",
    "type": "enterprise-harness:tdd-executor"
  },
  "worktree": {
    "path": "/absolute/path",
    "gitCommonDir": "/absolute/main/.git",
    "headBefore": "git-sha",
    "headAfter": "git-sha",
    "treeDigestBefore": "sha256",
    "treeDigestAfter": "sha256"
  },
  "executions": [
    {
      "phase": "RED",
      "argv": ["node", "test.mjs", "red"],
      "exitCode": 1,
      "startedAt": "ISO-8601",
      "finishedAt": "ISO-8601",
      "stdoutDigest": "sha256",
      "stderrDigest": "sha256"
    }
  ]
}
```

机械规则：

- phase 顺序固定 RED→GREEN→REFACTOR，时间单调。
- RED 必须非零；GREEN/REFACTOR 必须为零。
- task、agent、worktree、git HEAD、argv、digest 缺一即无效。
- worktree 即使被 Claude 回收，git common-dir spool 仍存在；main verify/archive 只消费
  imported durable receipt，不直接依赖已消失的 worktree path。
- imported receipt 记录 source spool digest 与 integration HEAD；实现 commit 未进入当前
  checkout 时 import/verify 均失败。
- `hasCurrentTaskTddExecutionEvidence(root,state)` 只消费有效 receipt；旧的
  `worktreeUsed/commandExecuted/summary/evidencePath` 仅作 UI projection。

#### 3. Cumulative execution prerequisites

新增共享 `validateExecutionPrerequisites(root, changeId, state, target, event)`，无论
`workflow.stage` 填什么都累计检查：

1. strict evidence policy 与 active change；
2. requirements + ambiguity score + explicit scope confirmation；
3. tier + router score；
4. design + non-block design review + `designApproved`；
5. finalized `# Tasks` + non-block plan review + `planReady`；
6. CodeGraph query evidence；
7. tool event 的 `agent_id` 属于 active scoped `tdd-executor`；
8. 写生产/OpenAPI 前，current task 已有有效 RED receipt。

Write/Edit/NotebookEdit 直接解析 path；Bash 对 `>`, `>>`, `tee`, `sed -i`, `cp`, `mv`,
`patch` 中的受治理路径做 conservative extraction。不能静态解析但实际改变受治理文件的 Bash
由 PostToolUse snapshot/diff 标 validation stale 并写 violation，completion 失败。

#### 4. Completion predicate

新增 `validateCompletionPredicate(root, changeId, state)` 并由 verify/stop/archive 共用：

- state 是 VALIDATED，impact 无 unknown；
- validation fresh 且 digest 等于当前资产；
- required reviewer verdict 完整、非 block、绑定当前 digest；
- evidence policy 从 sealed policy registry 解析，删除 state 字段不能把 strict 降级；
- strict change 的所有 task 有有效 REFACTOR receipt；
- agent ledger 无未完成 scoped agent 或 unresolved violation；
- change/evidence/validation 的现有结构校验通过。

`cmdArchive()` 先执行 predicate，全部通过后才写 ARCHIVED 并 rename；失败时不改 state、不移动目录。
显式 legacy change 只豁免 Agent/TDD provenance，仍强制 fresh/current validation digest、impact
无 unknown、completion reviewer 非 block 与结构校验；legacy 不是原有“只看 VALIDATED”路径。

### 数据 / SQL 设计

- Schema / table changes：无。
- Migration：无数据库迁移；runtime migrate 在升级时把当时存在的旧 change id 一次性写入
  `harness/evidence-policy.json`，模板与新 scaffold 默认 strict。registry 已存在时 migration
  拒绝新增/改写 legacy id。
- Rollback：代码回滚不删除 receipt；sealed policy registry 仍保留，避免重装后漂移。
- Constraints / indexes / transactions：N/A。

### 架构边界

- Skill 负责“何时派谁”；runtime 不成为 fat orchestrator。
- `bin/enterprise-harness.mjs` 只做 portable launcher：脚本路径相对 plugin root，操作目标
  仍为调用方 cwd。
- Hook adapter 负责接收官方事件、授权/阻断、生成 receipt。
- `agent-evidence.mjs` 与 `tdd-receipts.mjs` 是纯证据/校验域；CLI/lifecycle 只调用。
- checks 暴露共享 cumulative/completion predicate；pre-write/verify/archive 不复制规则。
- release 只消费 deterministic acceptance，不自动发布、不 push。

### 测试策略与 RED path

- Unit/fixture：
  - command/skill collision 与 scoped dispatch string；
  - Agent lifecycle event correlation、bare subtype、malformed Stop；
  - 主线程 exploration、无 CodeGraph attempt fallback、伪 stage 写入；
  - TDD receipt 不存在/字段缺失/phase exit 错误/合法顺序；
  - VALIDATED 但 digest/reviewer/TDD/agent 任一缺失时 archive 拒绝；
  - marketplace 四处版本与 release/prepublish acceptance。
- Integration：
  - hook 脚本以 JSON stdin 在 temp repo 执行；
  - `tdd-run` 对最小 Node fixture 真实跑 RED/GREEN/REFACTOR。
- Live E2E：
  - clean temp git repo 先用 source CLI `start-change` 建最小 durable target，再从 temp cwd
    执行 `claude --plugin-dir <repo>`；
  - stream-json 观察 Skill/Agent；
  - agent event ledger 观察 scoped Start/Stop；
  - PATH 中提供可控的 CodeGraph unavailable fixture，使 explorer 真实产生 attempt 后 fallback；
  - 本机 authenticated 必跑，CI 用 `HARNESS_LIVE_E2E=1`。
- 本 change 自身项目原生命令是 Node smoke；Java 目标项目在 tasks 中声明 `./mvnw ...` 后由
  同一个 `tdd-run` 无 shell 执行，不能再用字符串自报。

### 验证命令

```bash
node harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs verify
node harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs verify
node harness/plugin/runtime/test/cumulative-write-gate-smoke.mjs verify
node harness/plugin/runtime/test/tdd-receipt-contract-smoke.mjs verify
node harness/plugin/runtime/test/archive-completion-smoke.mjs verify
node harness/plugin/runtime/test/release-version-acceptance-smoke.mjs verify
node harness/plugin/runtime/cli.mjs verify
claude plugin validate .
HARNESS_LIVE_E2E=1 node harness/plugin/runtime/test/claude-plugin-live-e2e.mjs verify
```

## P 路径

### 方案选择

| 方案 | 优点 | 缺点 | 为什么选/不选 |
|------|------|------|-------------|
| A. 只改 prompt/skill 字符串 | 小 | 仍可伪造状态，hooks/归档不可信 | 不选 |
| B. 本 change 落最小 receipt + shared predicates | 修复真实故障，兼容历史 state | 尚非完整防篡改 hash chain | 选择 |
| C. 一次实现 FSM v4 + 全量 hash chain | 最完整 | 范围过大、迁移风险高 | 后续 change |

### 最终方案与实施顺序

1. 先写六组 deterministic RED smoke。
2. 修入口、scoped subtype 与 executor worktree frontmatter。
3. 实现 agent lifecycle receipt/hooks，再改 explore/write gate。
4. 实现 authoritative `tdd-run` 与 receipt validator。
5. 让 verify/stop/archive 消费 shared completion predicate。
6. 对齐 marketplace/release/prepublish/CI。
7. 跑现有 regression、plugin validate、clean-target authenticated live E2E。

### 风险与回滚

- 风险：Hook matcher/payload 误判导致 Agent 被阻断。
  - 回滚：移除新增 lifecycle hook registration；保留 deterministic smoke 定位。
- 风险：历史 change 被 strict 规则误伤。
  - 回滚：migration 只登记 baseline commit 中已存在的 change；policy 默认 strict，不能靠
    删除 state 字段或把新 id 追加到 registry 降级。
- 风险：模型直接编辑 legacy registry。
  - 缓解：pre-write/pre-Bash 禁止直接修改 `harness/evidence-policy.json`；verify 复核 seal、
    baseline commit 与每个 legacy id 的历史存在性。只有一次性 migration 命令可创建，已存在
    时拒绝重写。该边界防模型误操作，不宣称抵抗同 OS 恶意用户。
- 风险：Bash 静态解析漏写。
  - 缓解：Post snapshot/violation；首版不宣称 OS 级安全边界。
- 风险：Claude 旧 session 使用旧 plugin cache。
  - 缓解：验收使用 `--plugin-dir` clean session；安装更新后要求 reload/new session。
- 风险：live E2E 认证/费用。
  - 处理：本机已认证则必跑；CI 无凭据明确 skip，deterministic gate 仍 blocking。

### P 纠正预案

- 若 Agent hook 的官方实际 payload 与文档不符：保存 sanitized event fixture，收缩 matcher，
  不以猜测字段放行。
- 若 worktree receipt 无法从事件绑定：保留 `isolation: worktree`，以 hook cwd + git common-dir
  验证；仍无法证明则 BLOCK，不回退文本自报。
- 若全仓 regression 发现 legacy break：只修 compatibility adapter，不降低 strict 新 change gate。
- 回退条件：live plugin-only 无法加载 skill、Agent start/stop 无法关联、或 archive predicate
  产生数据损坏风险。

## Design Self-Review

- [x] T 目标明确且可验收
- [x] C 上下文基于 CodeGraph、源码与 live baseline
- [x] E 每个关键决策有官方/代码证据
- [x] P 路径包含替代方案、风险、回滚与纠正预案
- [x] API/interface 设计已定义
- [x] Data/SQL 明确为无变更

## Approval

独立 `design-reviewer` 首轮发现 worktree receipt、并发 dispatch binding 与 strict downgrade
blocker；修订后复核 verdict=pass，artifact digest 见 `reviews/design-reviewer.json`。
