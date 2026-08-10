# Design（闭环五检驱动）

> 每个关键设计决策都绑定四件事：目标、来源证据、验证方法、纠正路径。本设计是一次允许 breaking change 的治理合同重构，目标不是兼容旧合同，而是把当前分散、半机械、半靠纪律的 workflow/runtime 规则收敛成单一、可审计、可恢复、缺证据即阻断的执行面。

## Role Ownership
- 主导角色：Principal Architect
- 参与角色：Runtime Maintainer / Workflow Governance / Quality Engineer / Human User
- 本阶段交接物：`/home/wula/IdeaProjects/sdd/harness/changes/EH-WORKFLOW-TECPC-20260806/design.md`

## T 目标

### 业务目标
将 Enterprise Harness governance 升级为 schemaVersion 5 的统一执行合同，覆盖：
1. intake + clarify inline，route/design/plan/tdd/verify 保持 forked，且 executor/checker 分离可被 artifact 机械证明。
2. 用单一 machine-readable governance manifest 统一 stage、behavior、agent、checker、hook、artifact policy、decision 与 boot-time probe。
3. 为每个 stage 生成统一 TECPC checkpoint，取代当前分散在 `stage-contract.mjs`、`behavior-checks.json`、`workflow.mjs`、`state.json`、hooks、ledger 之间的隐式拼装。
4. 修复 WorktreeCreate 对 parent HEAD 中 `state.json` 的错误依赖，改为受控 worktree snapshot + import/writeback 模型。
5. 将 CodeGraph-first 从“有一次 attempt 即可”升级为“当前 worktree 索引有效、attempt 绑定当前 run/task/fallback”的硬合同。
6. 将 route 统一为六维严格 schema 与阈值；将 clarify 统一为信息增益、Socratic contradiction、Grill-Me adversarial probing 的可消费证据模型，并修正 clarify 与 design/plan 的 phase boundary。
7. 统一 workflow status / audit / Stop 的 current-stage 语义，使自动阻断与恢复提示来自同一审计引擎。

### 成功标准
1. `harness/governance/manifest.json` 成为 stage/behavior/agent/checker/hook/CLI 决策的唯一权威源；其余 registry 为生成物或受它校验的投影。
2. 每个 stage 都有 `checkpoints/<stage>.json`，其中包含：TECPC、required behavior execute/check 闭环、artifact/import 摘要、decision 状态、projection digest、blockers。
3. `state.json` 不再自证 gate，只投影 checkpoint digest、当前 stage、用户确认/审批/plan/tdd/validation 等 durable 结论。
4. WorktreeCreate 在 parent working tree 未提交 change 文件时仍可 fail-loud 且可恢复地创建 child worktree；child 使用 snapshot import，而不是依赖 parent HEAD 必须含 `state.json`。
5. wrong-worktree CodeGraph index 不再被 doctor/session-start 误报为健康；其结果不能作为可计数的 CodeGraph attempt，也不能放行 fallback。
6. route 使用固定六维 0-5 整数、总分、tier 阈值、impact 一致性和说明字段的机器校验；clarify scoring 允许“design-owned open items 已显式边界化”获得 4 分，而不强迫提前冻结 schema/payload/argv。
7. `workflow audit` 默认审计 current stage；`Stop` 复用同一引擎自动阻断并给恢复动作，不再存在“平时不报、完成时才报”的双重口径。
8. 本变更对 public HTTP/OpenAPI 与 SQL 数据库 schema 的适用结论为 `none`，但对 CLI/hook/file-backed durable contracts 的适用结论为 `applicable`，且证据明确。

## C 上下文

### 当前状态（Evidence-based）
- 已探索的模块/文件/接口：
  - 需求与当前 change：`harness/changes/EH-WORKFLOW-TECPC-20260806/{requirements.md,change.md,state.json}`
  - 稳定规范：`harness/specs/{workflow.md,agents-and-handoff.md,evidence.md,state-schema.md,ambiguity-scoring.md,stage-observability.md}`
  - 现状探索与独立 checker：
    - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_8681dbde-b57f-4d22-8bf8-987e35c33c6d/result.json`
    - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_2123a5ab-8b40-41da-95ac-1ba8d78b7d18/check.json`
    - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_03abfcb3-4bff-4e15-a964-980671937151/result.json`
    - `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_4293de43-9885-4e86-bfe8-d62296b9116b/check.json`
  - 运行时实现：
    - `runtime/lib/{stage-contract.mjs,workflow-audit.mjs,ambiguity.mjs,router-score.mjs,execution-prerequisites.mjs,codegraph-index.mjs}`
    - `runtime/hooks/{worktree-create.mjs,pre-explore.mjs}`
    - `runtime/evidence-import.mjs`
  - 当前 registry 面：
    - `harness/behavior-checks.json`：14 个 behavior
    - `.claude-plugin/plugin.json`：15 个 agent、9 个 skill 路径
    - `harness/reviewers/catalog.json`：5 个 reviewer catalog 项
    - `harness/plugin/hooks-manifest.json`：9 个 hook event group、12 个具体 hook 注册（`SessionStart`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`SubagentStart`、`SubagentStop`、`WorktreeCreate`、`TaskCompleted`、`Stop`）
- 已确认的技术约束：
  - workflow 顺序固定：`clarify → route → design → plan → tdd → verify → archive`。
  - `harness` 与 `harness-clarify` 必须 inline；route 之后为 forked stage skill，且仍需 executor/checker 双 run。
  - durable evidence 才是权威；聊天文本不可替代 artifact、receipt、ledger、checkpoint。
  - 当前 runtime 已有 handoff/ledger/TDD import 骨架，但没有统一 stage manifest/checkpoint source-of-truth。
  - 当前 route 解析仍是旧 5 维 Markdown parser；当前 change 已以 6 维模型写入 `change.md`，合同已分裂。
  - 当前 clarify runtime gate 强制所有维度 `>=4`，而 `requirements.md` 已证明这会误把 design-owned / plan-owned 细节提前拉进 clarify。
  - 当前 `codegraph status` 只看“是否 indexed”，不校验 index 所属 worktree；wrong-worktree 仍会被 doctor 报成 ok。
  - 当前 WorktreeCreate 用 `git cat-file` 强制 parent HEAD 含 `harness/changes/<id>/state.json`，导致 parent working tree 上未提交的 active change 无法被子 worktree安全接续。
- 已知的依赖和风险：
  - schema 与 registry 将跨 `harness/specs/**`、`runtime/lib/**`、`runtime/hooks/**`、plugin manifest、doctor、audit、tests 联动。
  - change 目录、git common dir spool、child worktree 之间的权威边界必须一次性定清，否则会继续出现“同名 artifact 多真相源”。
  - 这是治理 breaking redesign，不能假设 schema 4 artifacts 可被无损复用；必须显式 migration/rollback。

### 影响矩阵
| 层 | 受影响文件 | 影响类型 |
|----|-----------|---------|
| Interface | `harness/specs/{architecture.md,workflow.md,agents-and-handoff.md,evidence.md,state-schema.md,ambiguity-scoring.md,stage-observability.md}`；CLI status/audit/decide/import/probe contract；hook event contract | breaking contract redesign |
| Application | `runtime/lib/{workflow,stage-contract,workflow-audit,ambiguity,router-score,execution-prerequisites,codegraph-index}`；`runtime/evidence-import.mjs` | orchestration, validation, checkpoint, import, audit rewrite |
| Domain | `harness/governance/manifest.json`（新）与 `checkpoints/*.json`（新）等 durable workflow schema | new authoritative source-of-truth |
| Infrastructure | `runtime/hooks/{session-start,worktree-create,pre-explore,subagent-stop,post-agent,stop}`；doctor/probe；plugin hook manifest / settings generation | fail-loud gating, boot-time conformance, worktree snapshot |

## E 证据

### 设计决策依据
| 决策 | 证据来源 | 验证方法 | 纠正路径 | 置信度 |
|------|---------|---------|---------|--------|
| 用单一 governance manifest 取代分散 registry 作为权威源 | `run_8681.../result.json` facts[3][4] 指出 stage contract 分散在 `stage-contract.mjs`、`behavior-checks.json`、`workflow.mjs`、`state.json`；`harness/specs/stage-observability.md` 仍声称 `stage-contract.mjs` 是唯一机器真相，但现实已非如此 | 启动期 conformance probe 校验 manifest ↔ generated hook/plugin/reviewer/behavior 投影 parity；`governance-manifest-contract` smoke 测试 | 任何 parity mismatch 立即 `BLOCK [EH-GOV-MANIFEST-001]`，提示重新生成投影并修复 registry ownership | 高 |
| 每个 stage 新增 TECPC checkpoint，state 仅作投影 | `runtime/lib/workflow-audit.mjs` 当前需要拼 artifacts/state/handoffs 才知道阶段状态；`requirements.md`/`change.md` 要求 stagewise TECPC artifact/checkpoint/auto-block | `stage-checkpoint-smoke`、`workflow-audit-smoke`、`trace` 对 checkpoint digest、behavior closure、state projection 一致性做校验 | checkpoint 缺失/摘要不一致时报 `EH-CHECKPOINT-*`，禁止推进并指向缺失 run/artifact | 高 |
| clarify 保持 inline，但把 intake 并入 clarify checkpoint 的 subphase；route 之后保持 forked | `harness/specs/workflow.md`、`agents-and-handoff.md` 明确 inline clarify / forked 后续阶段；用户 scope 也明确要求如此 | `route-stage-separation-smoke` 与新 `inline-clarify-checkpoint-smoke` 验证 stage mode 与 user confirmation 只能在 inline path 发生 | 若 forked stage 企图写入 user confirmation/routeReady，报 `EH-STAGE-MODE-001` 并回退至主 orchestrator 决策 | 高 |
| WorktreeCreate 改成 snapshot + import，不再依赖 parent HEAD 已含 state.json | `runtime/hooks/worktree-create.mjs` 116-124、296-309；探索结果证实现有 fail-closed 原因就是 parent HEAD 看不到 active change state | `worktree-snapshot-import-smoke`、`worktree-ownership-cleanup-smoke`、手工 audit snapshot digest | snapshot 生成/导入失败时报 `EH-WORKTREE-SNAPSHOT-*`；保留 ownership-proof cleanup，不做猜测性删除 | 高 |
| CodeGraph attempt 必须绑定 valid same-worktree index、run/task/behavior/fallback | `runtime/hooks/pre-explore.mjs` 当前仅记 agent-bound attempt；`runtime/lib/codegraph-index.mjs` 不识别 wrong-worktree；探索结果已实跑 doctor 误报健康 | `codegraph-index-identity-smoke`、`codegraph-fallback-binding-smoke`、`doctor --json` / `session-start` probe | wrong-worktree index 报 `EH-CODEGRAPH-INDEX-001`；fallback 缺绑定报 `EH-CODEGRAPH-ATTEMPT-002`；恢复动作为在当前 worktree 重建索引 | 高 |
| route 采用 6 维严格 schema，而不是 Markdown parser 5 维软校验 | `runtime/lib/router-score.mjs` 当前仅 5 维；`change.md` 已使用 6 维 `L3` 模型；checker `run_2123.../check.json` 已确认合同 split | `route-score-schema-smoke`、`workflow decide confirm-route` 一致性测试、audit 对 tier/impact/score 总分校验 | 任何缺维、总分错误、tier 与阈值不符、impact 与 narrative 不符，全部 `BLOCK` | 高 |
| clarify 引入 interview evidence schema，并把 4 分标准改为“phase-correct、下游未决已边界化” | `requirements.md` 已明确当前低分来自 phase boundary 缺陷；`runtime/lib/ambiguity.mjs` 仍把 design-owned/plan-owned 细节误当 clarify 必须项 | `clarify-interview-evidence-smoke`、`ambiguity-phase-boundary-smoke`，校验 question mode、answer provenance、score rationale、overall 公式 | 缺 interview evidence 或把 design/plan 细节错投 clarify 报 `EH-CLARIFY-PROBE-*`；恢复为补 interview round 或下游 open-item 记录 | 高 |
| 审计默认纳入 current stage，Stop 与 completion 共用同一 engine | `runtime/lib/workflow-audit.mjs` 当前默认只审 completed stages，`checks.mjs` completion 才 `includeCurrent=true`；探索结果指出这会造成口径分裂 | `workflow-audit-current-stage-smoke`、`stop-audit-block-smoke`、`status-json-contract-smoke` | current-stage blocker 统一报 `EH-AUDIT-STAGE-*`；Stop 显示 recovery，不允许静默结束 | 高 |
| Public HTTP/OpenAPI contract 为 none，但 CLI/hook/runtime interface 为 applicable | `change.md` 非目标明确排除 `openapi/**` 与业务 controller；模块定位为 governance core；`20-java.md` 说明只有公开 API 适用时才做 OpenAPI contract | `design-check-api` 对本 change 应返回 `unsupported`；CLI/hook contract 由 `status/audit/decide/import/probe` tests 覆盖 | 若 scope 后续扩到 OpenAPI/controller，则 route/design 必须新增 API reviewer；当前 scope 下任何把 public API 标成 pass 的结论都应纠正为 `unsupported` | 高 |
| SQL schema/migration 为 none，但 file-backed durable data schema/migration 为 applicable | `requirements.md` 74-85 明确数据域是 `state.json`、handoff、receipt、ledger、audit projection、stage artifact；change 不涉及业务 DB | schema migration tests 覆盖 JSON/JSONL/Markdown artifacts；不运行 SQL migration | 若实现出现 DB 表/SQL 依赖，视为 scope 漂移，必须重新 route；当前设计中 DB migration 结论固定为 `none` | 高 |

### 测试策略
- Unit：
  - governance manifest schema parser / generator
  - stage checkpoint digest 与 projection validator
  - route six-dimension scorer / tier resolver
  - clarify phase-correct scorer 与 interview evidence validator
  - codegraph index identity parser
  - snapshot manifest digest / provenance validator
- Integration：
  - WorktreeCreate snapshot 生成、child import、ownership-proof cleanup
  - generic artifact import（TDD receipt 与 worktree snapshot 两类）
  - session-start / doctor conformance probe
  - pre-explore codegraph attempt + fallback binding
  - workflow status / audit / decide / stop 对 checkpoint 的消费
  - subagent-stop/post-agent 对 execute/check result + checkpoint reconcile 的联动
- Backend API E2E：
  - `none`（无 public HTTP/OpenAPI API）
  - 替代性 CLI/Hook E2E：start/change → inline clarify → route confirm → design produce/check → plan freeze → tdd import → verify → stop/audit
- RED path：
  - wrong-worktree CodeGraph index
  - fallback 无 valid attempt / fallback reason
  - registry parity mismatch
  - stage checkpoint 缺 execute/check 闭环
  - route score 缺维或 tier 不一致
  - clarify 只有评分表、没有 interview evidence
  - snapshot digest 不匹配或 child import 不完整
  - current stage blocker 在 Stop 未被拦截

### 验证命令
> 设计阶段冻结“验证面”，不冻结 plan-owned exact argv；具体命令与顺序由 plan 阶段定稿。

- Conformance / bootstrap：`node runtime/doctor.mjs --json`
- Workflow status / audit：`node runtime/cli.mjs workflow status <change-id> --json`、`node runtime/cli.mjs workflow audit <change-id> --json`
- Snapshot / import：`node runtime/cli.mjs workflow import-artifact <change-id> <kind> <artifact-id> --json`
- Trace：`node runtime/cli.mjs trace --change <change-id> --mermaid`
- Contract smoke suites（名称冻结，argv 由 plan 定）:
  - `runtime/test/governance-manifest-contract-smoke.mjs`
  - `runtime/test/stage-checkpoint-smoke.mjs`
  - `runtime/test/worktree-snapshot-import-smoke.mjs`
  - `runtime/test/codegraph-index-identity-smoke.mjs`
  - `runtime/test/codegraph-fallback-binding-smoke.mjs`
  - `runtime/test/route-score-six-dimension-smoke.mjs`
  - `runtime/test/clarify-interview-evidence-smoke.mjs`
  - `runtime/test/ambiguity-phase-boundary-smoke.mjs`
  - `runtime/test/registry-conformance-probe-smoke.mjs`
  - `runtime/test/workflow-audit-current-stage-smoke.mjs`
  - `runtime/test/stop-audit-block-smoke.mjs`
  - `runtime/test/schema5-migration-smoke.mjs`

## P 路径

### 方案选择
| 方案 | 优点 | 缺点 | 为什么选/不选 |
|------|------|------|-------------|
| A. 单一 governance manifest + stage checkpoint + 通用 import policy | source-of-truth 单一；audit/status/stop 可共享；能一次解决 registry 漂移、checkpoint 缺失、route/clarify 分裂、CodeGraph 绑定与 snapshot/import 问题 | 需要较大范围 schema 与 runtime 重构 | 选中。只有该方案能满足“breaking redesign、统一 TECPC、auto-block、可恢复、可审计”全部约束 |
| B. 保留 `stage-contract + behavior-checks + workflow + state` 多源，只补 digest 和 probe | 改动较小；局部迁移容易 | 仍保留多真相源；current-stage、route、clarify、hook registry、snapshot/import 会继续割裂 | 不选。只能治表层，不满足 confirmed scope |
| C. 把全部真相压进 `state.json` | 读写入口少；投影简单 | `state.json` 会变成既是 evidence 又是 self-assertion；与“state 只投影 evidence”长期合同冲突 | 不选。会放大伪造风险并削弱独立审计 |

### 最终方案

#### 一、权威合同拓扑
新增并冻结以下 authority 层：

| Artifact | 角色 | Authority | 备注 |
|---|---|---|---|
| `harness/governance/manifest.json` | 仓库级权威 registry | stage / behavior / agent / checker / hook / decision / import policy / probe policy 唯一真相源 | 生成或校验其他 registry 投影 |
| `harness/changes/<id>/checkpoints/<stage>.json` | change 级 stage 权威事实 | stage TECPC、required behavior 闭环、artifact/import 摘要、decision 状态、projection digest、blockers | 每个 stage 一份 |
| `harness/changes/<id>/state.json` | change 级快速投影 | 当前 stage、checkpoint digests、用户确认/审批/plan/tdd/validation 等 durable 结论 | 不自证 gate，只引用 checkpoint |
| `harness/changes/<id>/runs/<run-id>/{input,result,check}.json` | behavior 级执行事实 | executor/checker handoff 证据 | 仍保留，但被 checkpoint 汇总 |
| `$(git-common-dir)/enterprise-harness/receipts/<change-id>/agent-events.jsonl` | append-only ledger spool | dispatch/start/codegraph-attempt/stop/violation 等原始时序 | change 内可有 imported projection 副本，但 common-dir spool 才是原始账本 |
| `$(git-common-dir)/enterprise-harness/worktree-snapshots/<change-id>/<snapshot-id>/` | snapshot spool | active change control-plane snapshot | 供 WorktreeCreate 与 artifact import 使用 |

设计原则：
- manifest 决定“应该有什么”；run/result/ledger 决定“实际发生了什么”；checkpoint 决定“某个 stage 现时是否闭环”；state 只投影 checkpoint 的已验证结论。
- 所有 digest 一律用 SHA-256，且 checkpoint 持有其依赖 artifact/run/result/import 的 digest 列表；state 只持有 checkpoint digest，不直接持有长链依赖。

#### 二、governance manifest 合同
`harness/governance/manifest.json` 采用 machine-readable JSON，至少包含：

1. `schemaVersion`
2. `stages[]`
   - `id`: `clarify|route|design|plan|tdd|verify|archive`
   - `mode`: `inline|forked|system`
   - `entrySkill`
   - `requiredCheckpoint`
   - `requiredDecisionIds[]`
   - `requiredArtifacts[]`
   - `requiredBehaviors[]`
   - `optionalBehaviors[]`
   - `artifactPolicies[]`
   - `auditPolicy`: `{ includeByDefault, stopCritical, completionCritical }`
3. `behaviors[]`
   - `id`
   - `stage`
   - `executorAgent`
   - `checkerAgent`
   - `handoffSkill`
   - `artifactPattern`
   - `durabilityMode`: `direct-write|spool-import|projection-only`
   - `requiresCodegraph`: `none|attempt|attempt+valid-index`
4. `agents[]`
   - 包含 15 个当前 agent 的权威声明及其 role：executor/checker/utility
5. `checkers[]`
   - 明确列出 7 个 checker-capable agent：`clarify-reviewer`、`requirement-reviewer`、`design-reviewer`、`plan-critic`、`api-consistency-reviewer`、`implementation-reviewer`、`verification-reviewer`
6. `hooks[]`
   - 覆盖 9 个 hook event group 与 12 个具体 registration：`SessionStart`、`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`SubagentStart`、`SubagentStop`、`WorktreeCreate`、`TaskCompleted`、`Stop`；schema 5 不计划删除任何现有 group，只把它们的 matcher、script、failMode、budget 与 stage/behavior 关系统一收敛到 manifest，再生成 hooks projection
7. `skills[]`
8. `decisions[]`
   - 例如 `confirm-scope`、`confirm-route`、`approve-design`、`freeze-plan`、`enter-verify`、`enter-archive`
9. `probePolicy`
   - spawn depth、hook parity、checker parity、CodeGraph index identity、generated projection parity 的启动期检查规则

投影关系：
- `harness/behavior-checks.json`、`harness/plugin/hooks-manifest.json`、reviewer catalog 补齐后的 checker projection、plugin agent/skill surface 都由 manifest 生成或在 CI/doctor 中与 manifest 对比。
- 任何存在于投影而不存在于 manifest，或反向缺失，均视为 `EH-GOV-MANIFEST-001`。

#### 三、阶段 checkpoint 合同
每个 `checkpoints/<stage>.json` 固定包含：
- `schemaVersion`
- `changeId`
- `stage`
- `stageMode`
- `manifestDigest`
- `status`: `not-started|in-progress|blocked|completed`
- `tecpc`
- `prerequisites[]`
- `behaviors[]`
  - `behaviorId`
  - `required`
  - `executeRunId`
  - `executeResultDigest`
  - `checkRunId`
  - `checkResultDigest`
  - `checkerVerdict`
  - `artifactRefs[]`
  - `importRefs[]`
- `artifacts[]`
- `imports[]`
- `decisions[]`
- `projection`
  - checkpoint 对 `state.json` 的唯一允许投影字段和值摘要
- `blockers[]`
- `updatedAt`
- `checkpointDigest`

阶段特有 payload：
- `clarify.stageData`
  - `intakeSummary`
  - `interviewRounds[]`
  - `ambiguityScore`
  - `scopeConfirmation`
- `route.stageData`
  - `routeScore`
  - `tier`
  - `impact`
  - `requiredReviewers`
- `design.stageData`
  - `contracts`: public API/CLI/hook/data/error/migration applicability 结论
- `plan.stageData`
  - `tasksFrozen`
  - `commandSetsDigest`
- `tdd.stageData`
  - `taskId`
  - `receiptImports[]`
- `verify.stageData`
  - `validationDigest`
  - `validationScope`

Checkpoint 生成策略：
- 不是由 worker 自报“我完成了”直接生效。
- runtime 在 execute/check artifact 落盘后进行 reconcile，只有当 manifest 要求的 behavior、artifact、import、decision 条件都满足，checkpoint 才能进入 `completed`。
- checker 若返回 `block`，checkpoint 必须进入 `blocked` 并携带 recovery。

#### 四、inline intake + clarify 合同
本 redesign 不新增独立 `intake` stage，而是把 intake 作为 clarify 的第一个 subphase，原因：
- workflow 主阶段顺序已稳定，新增 stage 会引入额外 route/plan/verify 迁移成本；
- 用户明确要求“inline intake + clarify”，不是要求单独 stage；
- clarify checkpoint 足以承载 intake summary 与后续 interview evidence。

clarify checkpoint 的新 interview evidence 模型：
- `questionMode`: `information-gain|socratic|grill-me|scope-confirmation`
- `targetDimensions[]`
- `questionText`
- `answerSource`: `user|exploration|docs`
- `answerRef`
- `hypothesisTested`
- `contradictionCheck`: `pass|found|not-applicable`
- `informationGainDelta`: `-1..+2`（要求非空，允许 0 表示确认而非增益）
- `riskShift`
- `nextWeakestReason`

phase-correct clarify scoring 规则：
- `Data / SQL clarity=4` 在 clarify 中的含义改为：受影响 durable data domains、ownership boundary、migration responsibility 已明确；字段级 schema、digest 算法、回滚脚本仍可留给 design。
- `Interface / API clarity=4` 改为：接口家族、caller boundary、兼容 stance 已明确；request/response/error envelope 仍可留给 design。
- `Acceptance criteria clarity=4` 改为：结果级可测目标已明确；exact argv、RED/GREEN sequencing 仍可留给 plan。
- runtime 不再单纯以“是否缺设计细节”判 clarify 失败，而是检查：
  1. 七维完整；
  2. weakest 与 interview 轮次一致；
  3. 所有 score 都有 evidence；
  4. 下游 open items 已被明确标记 owner phase；
  5. `scope-confirmation` 已发生。

#### 五、route 六维严格 schema
route 的机器真相不再靠解析 `change.md` Markdown 表格，而在 `checkpoints/route.json.stageData.routeScore` 中固定为：
- `boundaryBreadth`
- `durableContractDataScope`
- `interfaceApiContractBreadth`
- `architectureExecutionImpact`
- `governanceRuleEnforcement`
- `verificationRecoveryComplexity`

每维字段要求：
- `score`: `0..5` 整数
- `reason`: 非空字符串
- `evidenceRefs[]`: 非空数组

聚合字段：
- `total`: 六维和，必须 `0..30`
- `tier`: `L0|L1|L2|L3`
- `impact`: `api|data|architecture|rule = yes|no`
- `thresholdRule`: 记录触发 tier 的硬条件（例如 `total>=19`、`anyDimension=5`、`governanceBreaking=true`）

运行时严格校验：
- 缺任何一维、reason/evidence 为空、total 算错、tier 与阈值不符、impact 与 narrative 不符，全部 `BLOCK`。
- `change.md` 保留为人类叙述与 rationale，但它不再是 route gate 的机器解析入口。

#### 六、执行 / checker / artifact import 统一模型
统一三类 durability mode：

1. `direct-write`
   - 用于 `runs/*/input/result/check.json`、`requirements.md`、`change.md`、`design.md`、`tasks.md`、reviews
   - writer：主 orchestrator 或 hook/runtime
   - 校验：schema + digest + parent linkage + manifest parity

2. `spool-import`
   - 用于 TDD receipts、worktree snapshots、未来任何在隔离 worktree 先产生、再导入集成 checkout 的 artifacts
   - writer：executor/infra 先写 spool；integration runtime 再导入 durable change dir
   - 校验：source head、tree digest、common dir、changedPaths、artifact bytes equality、agent ledger linkage

3. `projection-only`
   - 用于 `state.json`、`checkpointDigest`、audit/stop/probe projections
   - writer：runtime reconcile / decide / audit
   - 校验：只能引用 upstream durable evidence，不能由聊天或手工字段自证

通用 import CLI：
- 新增 `node runtime/cli.mjs workflow import-artifact <change-id> <kind> <artifact-id> [--json]`
- `kind` 初版支持：`tdd-receipt`、`worktree-snapshot`
- 旧 `runtime/evidence-import.mjs <change-id> <task-id>` 可在迁移期内部适配到该命令，但 schema 5 下不再是权威公开接口

#### 七、worktree snapshot defect fix
新的 WorktreeCreate 合同：
1. parent repo 仍以 `parentHead` 创建 child source tree，保证代码来自可追踪 commit。
2. 但 active change control-plane 不再要求已经存在于 `parentHead` tree。改为：
   - 从 parent working tree 直接读取 `harness/ACTIVE_CHANGE` 与 `harness/changes/<id>/` 下受控治理 artifacts；
   - 生成 `worktree-snapshot.json` + 文件 digest 列表，写入 git common dir spool；
   - 在 child worktree 中导入该 snapshot，恢复最小 control-plane 文件集；
   - 最后写入 child `harness/ACTIVE_CHANGE`。
3. snapshot 仅包含 control-plane 文件，不复制整个 repo，也不复制 product source tree。
4. cleanup 继续保留 current ownership-proof 语义：只有 worktree path、branch、expectedHead 都可证明归属本次创建时才自动清理。

错误与恢复：
- `EH-WORKTREE-SNAPSHOT-001`: active change 声明存在，但源 change 目录不完整。恢复：在 parent working tree 修复缺失 artifact 后重试。
- `EH-WORKTREE-SNAPSHOT-002`: snapshot digest 与 child import 不一致。恢复：删除 child worktree，重新创建。
- `EH-WORKTREE-SNAPSHOT-003`: cleanup 无法证明 ownership。恢复：保留资源，输出人工命令；绝不误删。

#### 八、CodeGraph receipt 与当前 worktree index 有效性
新的 `codegraph-attempt` 账本/receipt 必须包含：
- `changeId`
- `stage`
- `behavior`
- `runId`
- `taskId`（适用时）
- `agentId`
- `toolKind`: `mcp|bash`
- `queryKind`: `explore|search|callers|callees|impact|node|files`
- `queryDigest`
- `cwdProjectRoot`
- `indexProjectRoot`
- `indexValidity`: `valid|wrong-worktree|not-initialized|unavailable`
- `fallbackAllowed`: `true|false`
- `fallbackReason`（仅 fallback 前已判可退化时可非空）

规则：
- `codegraph status` 永不计入 attempt，保持现有原则。
- 只有 `indexValidity=valid` 的 real query 才能满足 CodeGraph-first 前提。
- `wrong-worktree`、`not-initialized`、`unavailable` 都不能放行 Read/Grep fallback；必须 fail-loud，并给出恢复命令。
- governed write prerequisite 不再是“change 级有任意一次 attempt”，而是“当前 task/run 绑定的 required behavior 已有 valid attempt 或 manifest 声明本行为不需要 CodeGraph”。

doctor/session-start/probe：
- `runtime/lib/codegraph-index.mjs` 必须新增 worktree identity 解析；若 index 项目根与当前 git worktree 根不一致，则 severity=`fatal`。
- 启动期 probe 将此结果写入 repo 级 probe artifact；任何 governed stage entry 在 fatal probe 未修复前必须 block。

#### 九、hook / agent / checker 全注册表与 boot-time conformance probe
当前 registry 分散于 `behavior-checks.json`、`plugin.json`、`reviewers/catalog.json`、`hooks-manifest.json`、`.claude/settings.json`。schema 5 下：
- `manifest.json` 为唯一 registry authority。
- 其余文件是生成物或需与 manifest 强一致的投影。

boot-time conformance probe 至少校验：
1. manifest ↔ hook projections parity
2. manifest ↔ plugin agent/skill surface parity
3. manifest ↔ checker catalog parity
4. 每个 behavior 的 executor/checker agent 均真实存在
5. stage decision ids 与 `workflow status` 输出集合一致
6. spawn depth policy 满足 forked stage 需要
7. CodeGraph index identity 对当前 worktree 有效
8. required hook failMode 与 performance budget 未漂移

执行语义：
- SessionStart 运行 probe，但 hook transport 本身保持 fail-open，避免用户被完全锁死在普通对话外。
- 然而 governed entrypoints（`/harness*`、`workflow decide`、受治理写入、forked stage dispatch）必须检查“最近一次 probe 是否无 fatal finding”；若否，fail-loud 阻断。
- `doctor --json` 与 `workflow status --json` 均暴露 probe summary 与 fatal findings。

#### 十、审计语义：current stage 与 auto-stop 统一
统一审计引擎后：
- `workflow audit` 默认审已完成阶段 + 当前阶段；future 阶段仍显示为 `pending`，但不算 blocker。
- `workflow status --json` 返回：
  - `currentStage`
  - `currentCheckpoint`
  - `pendingDecision`
  - `blockers`
  - `probeSummary`
- `Stop` hook 调用同一审计引擎的 `mode=stop`：
  - 当前阶段 `blocked`
  - validation stale
  - 缺独立 checker
  - checkpoint digest 不一致
  - fatal probe finding
  任一成立都必须阻断会话结束并输出 recovery。
- completion/archive 只是 stop 模式的更严格超集，不再另有一套 current-stage 判断。

新增 durable projection：
- `harness/changes/<id>/evidence/runtime/last-audit.json`
- `harness/changes/<id>/evidence/runtime/last-stop-check.json`

二者都是 projection-only，方便恢复与 reviewer 查阅，不替代实时重算。

#### 十一、接口设计
- External API：
  - Public HTTP/OpenAPI：`none`
  - 证据：`change.md` 非目标明确排除 `openapi/**`、业务 controller 与公共 API；scope 属于 governance core
  - 运行规则：本 change 若调用 `design.check-api` / `verify.check-api`，结论应为 `unsupported` 而非 `pass`
- Internal service contract：`applicable`
  - CLI：
    - `workflow status <change-id> --json`
    - `workflow audit <change-id> [--json]`
    - `workflow decide <change-id> <decision-id>`
    - `workflow import-artifact <change-id> <kind> <artifact-id> [--json]`
    - `doctor --json`
    - `trace --change <change-id> --mermaid`
  - Hook：
    - `SessionStart` 负责 probe
    - `WorktreeCreate` 负责 snapshot generation/import
    - `PreToolUse:pre-explore` 负责 valid CodeGraph attempt/fallback gate
    - `SubagentStop` / `PostToolUse:Agent` 负责 result persistence 与 dispatch binding
    - `Stop` 负责 auto-stop audit
- Compatibility / caller impact：
  - breaking。schema 4 active changes 不得静默继续；必须迁移或在旧 runtime 完成。

#### 十二、数据 / SQL 设计
- Schema / table changes：
  - SQL / DB tables：`none`
  - File-backed durable schema：`applicable`
  - 新增/重构：
    - `harness/governance/manifest.json`
    - `harness/changes/<id>/checkpoints/*.json`
    - `harness/changes/<id>/evidence/runtime/{last-audit.json,last-stop-check.json}`
    - git-common-dir `worktree-snapshots/**`
    - 扩展 `state.json` 为 schemaVersion 5 checkpoint projection
- Migration：
  1. 新 runtime 默认只创建 schema 5 change。
  2. schema 4 active change 进入 governed flow 时返回 `unsupported`，并给两条恢复路径：
     - `workflow migrate <change-id> --to 5`
     - 用旧 runtime 完成/归档该 change
  3. 迁移命令必须先生成完整备份：`harness/changes/<id>/migration-backups/<timestamp>/`
  4. 若旧 change 证据不足以构造可靠 checkpoint，迁移必须 block，不得猜测补齐。
- Rollback：
  - 恢复 migration backup
  - 还原旧 runtime/plugin 版本
  - 删除 schema 5 projections/checkpoints 后重新加载旧合同
- Constraints / indexes / transactions：
  - 无 SQL index/transaction
  - 文件级一致性规则：temp + rename、expected revision compare、checkpoint digest compare、event id 幂等、防重写（对 import artifact 维持 exclusive write）

#### 十三、架构边界
- `harness/specs/architecture.md` 属于本次受影响长期合同，必须同步更新，明确以下 authority 对齐：
  1. 长 machine-readable schema 的权威来源仍只有一处，但本次把 repo-scoped governance control-plane schema 明确归入 runtime authority；spec 只描述不变量、边界和恢复语义，不再重复字段级 schema。
  2. `harness/governance/manifest.json` 虽存放在 `harness/` 下，但其所有字段、校验、生成与 reconcile 责任由 runtime 拥有；它是 runtime-owned control-plane schema，而不是第二份 spec schema。
  3. `harness/changes/<id>/checkpoints/*.json`、`state.json` projection、`evidence/runtime/*.json`、git-common-dir spool 也都属于 runtime authority；spec 只规定它们必须存在、如何被审计、哪些字段是投影而不是自证真相。
- 分层 ownership 冻结如下：

| 层 | Owned truth | 责任 |
|---|---|---|
| spec | 长期不变量、阶段顺序、authority 规则、恢复原则 | 定义 contract intent；不得复制 runtime 字段级 schema |
| rule | 给模型的即时约束 | 不得成为 durable schema authority |
| skill | 阶段 SOP 与 handoff 约束 | 只能引用 manifest/checkpoint，不能私自扩 schema |
| agent | 身份、工具、上下文边界 | 只能声明 capability，不能成为 behavior/checker 真相源 |
| hook | 机械 gate、receipt 记录、projection 触发 | 只读写 runtime-owned schema，不定义长期字段 |
| runtime | `manifest.json`、`checkpoints/*.json`、handoff schema、state projection、probe/audit/import validator | 唯一 machine-readable control-plane authority |
- Object / mapper responsibility：本仓库不适用 Java DTO/mapper 语义，改为 artifact writer / import validator / reconcile owner 三元分工：
  - writer：orchestrator、hook 或 executor 在 manifest 允许的 durability mode 下产生 artifact
  - import validator：校验 spool provenance、digest、common-dir、HEAD/tree/bytes equality
  - reconcile owner：runtime 根据 manifest + durable evidence 计算 checkpoint 与 state projection
- Error handling boundary：
  - spec/rule/skill/agent 的错误只能通过 runtime 统一错误码对外暴露；
  - hook 负责尽早 fail-loud，但不得发明脱离 runtime contract 的新 schema；
  - runtime 是唯一可以把 blocker 写成 checkpoint/state/probe projection 的层。

#### 十四、错误模型
统一错误分组，所有错误必须给 `code / status / path / message / recovery`：

| 组 | 示例 code | 触发条件 | 恢复 |
|---|---|---|---|
| Manifest / registry | `EH-GOV-MANIFEST-001` | manifest 缺失、projection parity mismatch、agent/checker/hook 未注册 | 重新生成/修复 registry，重跑 probe |
| Checkpoint | `EH-CHECKPOINT-001` | 缺 stage checkpoint；`-002` digest mismatch；`-003` checker 未独立闭环 | 修复缺失 run/artifact/check，reconcile checkpoint |
| Worktree snapshot | `EH-WORKTREE-SNAPSHOT-001..003` | snapshot 源缺失、digest 不符、cleanup ownership 无法证明 | 修源、重建 child、或人工回收 |
| CodeGraph | `EH-CODEGRAPH-INDEX-001`、`EH-CODEGRAPH-ATTEMPT-002` | wrong-worktree index、无 valid attempt/fallback binding | 在当前 worktree 重建索引，再重新探索 |
| Clarify | `EH-CLARIFY-PROBE-001..003` | 缺 interview evidence、score 无依据、phase-owned 细节错位 | 补 round、补 evidence、重新评分 |
| Route | `EH-ROUTE-SCORE-001..004` | 缺维/总分错误/tier 不符/impact 不一致 | 修 routeScore machine artifact 与 narrative |
| Probe / boot | `EH-PROBE-REGISTRY-001`、`EH-PROBE-CODEGRAPH-002` | boot probe fatal finding | 修复 probe finding 后重试 governed entry |
| Audit / stop | `EH-AUDIT-STAGE-001`、`EH-STOP-002` | current-stage blocker、validation stale、fatal probe | 修复 blocker，再重跑 audit |
| Migration | `EH-MIGRATION-001..003` | schema 4 无法无损迁移、backup 失败、checkpoint 生成失败 | 停止迁移，恢复 backup 或用旧 runtime |

状态语义：
- `pass`
- `advisory`
- `block`
- `unsupported`

其中 `unsupported` 只能用于“不适用但已给证据”的场景，例如本 change 的 public OpenAPI review；不得把真正的 blocker 降格成 unsupported。

#### 十四、迁移、兼容与 fail-loud 行为
- 兼容性：`none`，但不是“随便破坏”。意味着：
  - 不保证 schema 4 active change 可被 schema 5 runtime 直接消费；
  - 必须显式 detect、显式 block、显式给迁移/回退路径。
- fail-loud：
  - 缺 manifest / checkpoint / valid CodeGraph index / independent checker / probe pass / migration backup，全部自动 block。
  - 不允许通过手改 `state.json`、补写 narrative Markdown、或聊天说明“其实已经做了”来越过 gate。

### 风险与回滚
- 风险：
  1. 单一 manifest 引入后，生成链路若失效，可能一次影响 hooks/plugin/reviewer/behavior 多面。
  2. checkpoint reconcile 若实现不严谨，可能造成 state 与 checkpoint 漂移。
  3. snapshot/import 会引入额外 digest 与 spool 生命周期管理。
  4. schema 4 → 5 迁移若试图“自动猜”旧 evidence，会破坏审计可信度。
- 回滚策略：
  1. 代码层：回退到 schema 4 runtime/plugin 版本。
  2. 数据层：恢复 `migration-backups/` 中的 change 目录；删除 schema 5 新增 projection/checkpoint/import artifacts。
  3. 运行层：若 boot probe/manifest generation 失效，禁止 governed stage entry，但不阻止普通对话；修复 probe 后再恢复工作流。

### C 纠正预案
- 降级方案：
  - 不提供 silent degradation。
  - 唯一允许的降级是“read-only historical/unsupported mode”：对 schema 4 或 probe fatal 的仓库，允许 `doctor/status/audit` 读事实，但禁止继续 governed execution。
- 回退条件：
  - schema 5 checkpoint reconcile 不能稳定重建 stage status
  - worktree snapshot import 破坏 active change continuity
  - boot probe 无法稳定区分 fatal 与 advisory，导致正常 governed flow 被普遍误杀
- 监控指标：
  - checkpoint reconcile 失败率
  - wrong-worktree CodeGraph probe 命中率
  - Stop hook 阻断次数与 blocker 分类
  - migration block / rollback 次数
  - registry parity 漂移次数

## Design Self-Review
- [x] T 目标明确且可验收
- [x] C 上下文基于事实（非猜测）
- [x] E 每个关键决策有证据、验证方法和纠正路径
- [x] P 路径清晰且有纠正预案
- [x] 明确给出 public API `none`、SQL `none`、CLI/hook/file-backed data `applicable` 的证据结论
- [x] 覆盖 worktree snapshot、CodeGraph index validity、registry probe、route 六维、clarify interview、audit current-stage、migration、fail-loud、tests、rollback

## Approval
- 待独立 `design-reviewer` 检查。
