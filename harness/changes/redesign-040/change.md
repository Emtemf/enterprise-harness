# Change

## 原始需求
将用户确认的 Enterprise Harness 0.4 breaking redesign 建议收敛为 Phase 1-3 的可实现变更：controller/subject、自举边界、State v5、session concurrency、artifact dependency invalidation、archive/abandon、CodeGraph/Context7 research packet 与结构化 waiver。

## 业务结果
Harness 能在同一仓库、多个 Claude session 和多个 worktree 中并行运行不同 change；同一 change 的写入不会静默互相覆盖；上游 artifact 修改会使下游 evidence/validation 可解释地 stale；研究降级和例外可审计；正在开发的 Harness 不再依赖正在修改的 runtime 自判。

## 非目标
- 不实现 Phase 4-6 的 Skill/Agent/Hook 全量重构。
- 不迁移或修改 `harness/archive/**` 历史内容。
- 不修改 subject 业务代码、Java/OpenAPI 受治理路径。
- 不新增 workflow DSL，不把 worktree 镜像当作 durable truth。

## 归属服务 / 模块 / 业务域
Enterprise Harness controller/runtime、plugin 入口、workflow/state/evidence 真相层、spec/tests。

## 初步路由
L3。跨运行时状态、并发、证据生命周期和控制面接口的架构变更。

### Router 评分
| 维度 | 分数 | 说明 |
|---|---:|---|
| Scope complexity | 5 | 触及 runtime、state、evidence、plugin、spec、tests。 |
| Impact breadth | 5 | 影响多 session、worktree、archive、研究治理和发布入口。 |
| Unknowns / ambiguity | 4 | 范围已确认，字段级 schema 和迁移方式留给 design。 |
| API / data risk | 5 | State v5 不兼容 active v4，并影响 status/doctor/workflow 输出。 |
| Test / rollback complexity | 5 | 需要并发、迁移、失效、waiver、archive/abandon 场景验证。 |
| **Overall** | **5** | L3 架构级改造。 |

## 最小探索证据
- `harness/changes/redesign-040/runs/run_4fe5c832-8e72-4888-a728-1a4ba92e7717/result.json`
- `harness/changes/redesign-040/evidence/workflow-events.jsonl`（包含 `confirm-scope` durable decision）
- 已确认当前是 `ACTIVE_CHANGE` 单指针、局部 CAS、路径级 stale、archive-only、粗粒度 research tooling 和文档级 waiver。
- 可复用：`runtime/lib/state-store.mjs`、`runtime/lib/handoff.mjs`、`runtime/lib/agent-evidence.mjs`、`runtime/lib/worktree.mjs`、package/release 验证链。

## 最终路由
- tier：L3
- owning service / module / 业务域：Enterprise Harness controller/runtime；workflow/state/evidence 真相层；controller-facing CLI/plugin surface（`status`、`doctor`、`workflow`、`archive/abandon`、`research/waiver`）；spec/tests。
- API：yes。依据：requirements 已明确 `status`/`doctor`/`workflow`/plugin 输出，以及 `archive`/`abandon`、`research`/`waiver` 的命令与兼容策略需要 redesign。
- Data：yes。依据：requirements 明确要求 State schema v5、active v4 阻断边界、session binding、change lock、ledger、artifact digest dependency graph，以及 `archive`/`abandon`/`waiver` 的 durable 记录。
- Architecture：yes。依据：requirements 明确改变 controller/subject 边界、self-hosting 真相层归属、多 change 并行 + 同 change 串行写模型、artifact invalidation/rewind 推导方式。
- Rule：yes。依据：requirements 明确改变 gate 判定、stale 传播、controlled rewind、fallback/degraded/block、waiver 失效，以及 `archive` 与 `abandon` 的完成/终止规则。
- route non-goals：继续沿用本 change 非目标，不扩展到 Phase 4-6 skill/agent/hook 瘦身，不回填旧 archive，不改 subject 业务代码，不引入新的 workflow DSL，不把 worktree 提升为 durable truth。
- 必需 reviewer：
  - `requirement-reviewer`：独立复核 tier、owning surface、impact matrix 与 reviewer 组合。
  - 独立 design checker：重点审 State schema/migration、workflow/audit gating、controller-facing 兼容策略。
  - 独立 verify/implementation checker：重点审并发锁、archive/abandon、research/waiver 与 validation freshness 证据。
- routeReady 仍待用户确认 route 后由 workflow decide 写入；本次 executor 只产出 route 投影，不越权推进 workflow gate。

## 影响矩阵
| API | Data | Architecture | Rule |
|---|---|---|---|
| yes | yes | yes | yes |

## 需要确认的决策
- route 阶段确认 tier、owning surface 和 reviewer 组合。
- design 阶段冻结 State v5 字段、active v4 进入策略、session/lock 布局、依赖图、archive/abandon 命令与 research/waiver schema。
- design 阶段确认 controller-facing status/doctor/workflow 输出的兼容策略。

## 假设
- git common dir 可稳定承载 sessions、locks、ledger。
- archive 旧资产保持可读，不批量迁移。
- worktree 仅隔离代码执行和 task brief。
- 现有 handoff、ledger、worktree 安全校验和发布验证可复用。

## Waiver
本阶段不申请 waiver。

## Requirement Review
- requirements.md 已落盘，七维评分关键项均 >=4。
- 用户已确认 Phase 1-3 范围和真相层边界。
- routeReady 尚未由独立 route checker + 用户 confirm-route 产生。
