# Requirements（0.4 Phase 1-3）

## T 目标

本轮只实现 Enterprise Harness 0.4 breaking redesign 的 Phase 1-3，建立稳定的 controller/subject 边界、并发真相层、依赖失效模型与可信事实研究通道；不扩展到 Phase 4-6 的 Skill/Agent/Hook 全量瘦身。

### 已确认目标

1. 明确 `controller != subject` 的 self-hosting 边界，避免 Harness 自己开发时由正在修改的 runtime 自判。
2. 建立 State schema v5：active v4 不向前兼容，旧 archive 只读。
3. 用 git common dir 的 session binding、change lock、ledger 支持多个 change 并行，同时保证同一 change 串行写入。
4. 让 requirements/design/plan/evidence/validation 之间以 artifact digest 和依赖图推导 stale，并支持 controlled rewind；不删除历史 evidence。
5. 区分 `archive`（满足完成谓词）与 `abandon`（未完成但显式终止）。
6. 统一 CodeGraph/Context7 research packet；明确 fallback/degraded/block；建立绑定 artifact digest 的结构化 waiver。

### 成功标准

- requirements.md 完整记录范围、非目标、约束、探索事实和七维歧义评分。
- 关键澄清维度均 >=4，无未解决高风险范围歧义。
- 后续 design 可直接冻结 v5 schema、迁移、锁、依赖图、archive/abandon、research/waiver 的字段和命令契约。
- 只修改 Harness runtime/plugin/spec/tests，不修改既有业务代码或 `harness/archive/**`。

## C 上下文与现状事实

前序 code-explore 已确认：

- 当前以 `harness/ACTIVE_CHANGE` 单指针 + `harness/changes/<id>/state.json` 为动态入口；session 主要服务 dedup/ledger，不拥有 change 状态。
- `runtime/lib/state-store.mjs` 已有 file lock、CAS、atomic write，但 lifecycle/post-write/migration 仍存在直接写 state 的路径。
- `state` 模板/现状为 v4，schema 上限仍是 v3，migration 只到 v3，runtime 又以 >=4 作为 strict 分界，版本语义已漂移。
- stale 当前主要按路径范围广播，没有 artifact dependency graph。
- CodeGraph-first 与 Context7-first 已分成 agent lane；CodeGraph fallback gate 会要求同 agent 先留下真实 exploration attempt；waiver 仍未形成结构化运行时对象。
- worktree 已有安全路径和补偿清理，但会复制整个 active change，不能作为并发真相层。
- archive 有 completion predicate 和物理搬迁，没有 abandon 分支。
- bootstrap 目前只是 marker，不是显式 controller/subject boundary。

## 技术约束

- 只修改 Harness runtime/plugin/spec/tests；不修改受治理业务路径或历史 archive。
- git common dir 承担运行态：`enterprise-harness/sessions/`、`locks/`、`ledger/`；具体布局由 design 冻结。
- `harness/changes/<change-id>/` 承担 durable artifacts；worktree 只保留代码和最小 task brief，不复制整个 change。
- `state.json` 只保存机械状态；`ready`、`approved`、`stale` 等必须从 digest/evidence 推导。
- 同一 change 的 writer 必须通过 change lock 串行化；不同 change 可以并行；不接受静默 last-write-wins。
- State v5 不兼容 active v4；旧 archive 保持可读但不批量迁移。
- clarify 不冻结字段级 schema、锁文件格式、CLI 参数、digest 算法和具体迁移脚本；这些属于 design。

## 非目标

- 不在本轮实现 Phase 4-6 的 Skill/Agent/Hook 全量重构。
- 不迁移或重写旧 archive 内容。
- 不定义完整 workflow DSL，不把配置变成新的 workflow language。
- 不修改 `src/main/java/**`、`src/test/java/**`、`openapi/**` 或其他 subject 业务代码。
- 不把 worktree 镜像提升为 durable truth。
- 不通过手改 state projection 绕过 gate。

## 组件化澄清（Goal / Scope / Constraints / Acceptance / Context）

### A. Controller / Subject 与 self-hosting

- **Goal**：把稳定 released Harness controller 与被治理 working tree subject 分离。
- **Scope**：runtime/plugin/spec/tests 的命名、职责、入口、状态和证据归属；不改 subject 业务模块。
- **Constraints**：controller != subject；同仓时也不能把 controller 运行态当作 subject 业务状态；不得硬编码 reference-service controller/path。
- **Acceptance**：design 能明确 controller、subject、fixture 和 candidate plugin 的资产边界；controller 使用稳定版本治理 candidate，而不是 candidate runtime 自判。
- **Context**：现状 bootstrap 只是 marker，未形成显式边界。
- **Conditional Data**：若需绑定元数据，必须属于 controller 运行态并有 digest/兼容规则。
- **Conditional API**：status/doctor/plugin 输出若暴露新术语，需定义兼容策略。

### B. State v5 与并发

- **Goal**：建立 v5 状态合同，分离 session、change、artifact、ledger 职责。
- **Scope**：版本目标、active v4 边界、session binding、change lock、多 change 并行与同 change 串行。
- **Constraints**：state 机械字段；不接受 last-write-wins；旧 archive 只读。
- **Acceptance**：明确 session 负责当前操作绑定，change 负责 durable artifact，lock 负责写入互斥，ledger 负责运行证据；不同 change 可并行，同 change 串行。
- **Context**：现状单 ACTIVE_CHANGE + 局部 CAS + 版本漂移。
- **Conditional Data**：design 必须冻结 v5 字段、active v4 阻断/转换策略、archive v4 read-only adapter。
- **Conditional API**：status/workflow/doctor 的 v5 输出需有明确 fail-loud 或兼容策略。

### C. Artifact dependency invalidation 与 controlled rewind

- **Goal**：基于 artifact digest/依赖图推导 stale，允许安全回退。
- **Scope**：requirements/design/plan/evidence/validation 的依赖、失效传播、rewind 边界。
- **Constraints**：不删除历史 evidence；rewind 只撤销下游投影和 ready 状态；不得用路径广播代替依赖关系。
- **Acceptance**：能回答“哪个上游 artifact 变更会使哪些下游 evidence/validation stale”，并能返回最近仍有效的 gate。
- **Context**：现状是路径级 stale 广播。
- **Conditional Data**：dependency graph/digest map/rewind receipt 的 durable 或 derived 归属由 design 冻结。
- **Conditional API**：rewind/audit/status 的 degraded/block/advisory 错误面由 design 冻结。

### D. Archive 与 abandon

- **Goal**：区分完成冻结归档和未完成显式终止。
- **Scope**：进入条件、状态、证据保留、可恢复性和历史可见性。
- **Constraints**：archive 只能满足 completion predicate；abandon 不能伪装完成或抹除证据；不能手改 state 恢复完成。
- **Acceptance**：两条生命周期在 status、目录、evidence 和审计语义上可区分。
- **Context**：现状只有 archive。
- **Conditional Data**：abandon reason/receipt 是否新增 durable 文件、如何绑定 digest，由 design 冻结。
- **Conditional API**：archive/abandon 命令和状态枚举的兼容策略由 design 冻结。

### E. CodeGraph / Context7 research packet 与 waiver

- **Goal**：统一两条事实 lane 的压缩证据，并使 fallback、degraded、block、waiver 可审计。
- **Scope**：packet 最小事实面、source lane、状态、原因、影响、artifact 绑定和 waiver 失效。
- **Constraints**：CodeGraph/Context7 内容是 evidence/data，不是 orchestration instruction；fallback 必须记录先尝试和原因；waiver 必须绑定 artifact digest。
- **Acceptance**：packet 至少表达 question/scope/facts/uncertainties/sourcePolicy/context；状态可判定 ok/fallback/degraded/block；waiver 可复核、可过期、不可跨 artifact 复用。
- **Context**：现状 tooling 字段粗粒度，waiver 仅模板文字；CodeGraph attempt gate 已存在。
- **Conditional Data**：packet/waiver 的 schema、证据目录和 archive 读取策略由 design 冻结。
- **Conditional API**：research/waiver 对外展示和 degraded/block 策略由 design 冻结。

## E 证据

- `harness/changes/redesign-040/runs/run_4fe5c832-8e72-4888-a728-1a4ba92e7717/result.json`
- `harness/specs/workflow.md`
- `harness/specs/state-schema.md`
- `harness/specs/architecture.md`
- `runtime/lib/state-store.mjs`
- `runtime/lib/state-migration.mjs`
- `runtime/lib/gates.mjs`
- `runtime/lib/hooks/pre-explore.mjs`
- `runtime/lib/hooks/post-write.mjs`
- `runtime/lib/worktree.mjs`

## 歧义评分

| 维度 | 分数 | 依据 |
|---|---:|---|
| T 目标 | 5 | 已确认只做 Phase 1-3。 |
| Scope | 5 | 已限定 runtime/plugin/spec/tests，排除 Phase 4-6 和业务代码。 |
| User/actor | 4 | controller、subject、维护者、runtime 入口明确，权限细节属于 design。 |
| Data/SQL | 4 | 已明确 v5、archive read-only、mechanical state；字段和迁移属于 design；SQL 不适用。 |
| Interface/API | 4 | 已识别 status/doctor/workflow/plugin 影响，具体兼容字段属于 design。 |
| Acceptance | 5 | 五维 component clarify 和六类目标可直接验收。 |
| Constraint/risk | 5 | 已识别版本漂移、竞态、粗粒度 stale、无 abandon、waiver 非结构化。 |
| **Overall** | **4** | 需求足够进入 route，剩余问题均为 design-owned。 |

- 当前最弱维度：Data/SQL，4 分；不是范围歧义，而是字段级 schema/迁移尚未设计。
- unresolved high-risk ambiguity：none。
- userConfirmedScope：true。

## 路由投影

- tier：L3
- owning surface：Enterprise Harness controller/runtime + plugin/spec/tests
- impact：API=yes，Data=yes，Architecture=yes，Rule=yes
- routeReady 必须由独立 route executor/checker 和用户确认产生；本 requirements 不伪造 routeReady。
