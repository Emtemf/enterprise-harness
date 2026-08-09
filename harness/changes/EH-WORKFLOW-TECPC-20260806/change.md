# Change

## 原始需求
- 这是一次允许不兼容的 Enterprise Harness governance breaking redesign，不是兼容性增量修补。
- 目标是把 inline intake + clarify、后续 forked stage execution、独立 checker、TECPC artifact/checkpoint/auto-block、CodeGraph-first durable evidence、registry/probe/hooks/agents/checkers、worktree snapshot + artifact import repair、clarify rubric（含 Socratic / Grill-Me）统一纳入可执行、可审计、可恢复、缺证据即阻断的治理合同。
- 允许联动重设计全部 durable contracts：`state.json`、handoff input/result、receipts、ledgers、audit projections、stage artifacts；兼容旧治理合同不是目标。

## 业务结果
- 每个 governed stage 都必须留下成对的 execute/check durable artifact，并满足 TECPC 可审计闭环。
- 缺少 prerequisite、receipt、ledger 或 validation 时，runtime 必须自动 block，而不是依赖聊天纪律或人工习惯。
- inline clarify 与后续 forked execution 的边界必须能被 artifact 和 runtime gate 机械证明。
- registration、probing、hooks、agents、checkers、CodeGraph-first evidence 必须从“指导原则”提升为“可执行治理规则”。
- route complexity 必须产出可重复、可解释、可审计的量化结论。

## 非目标
- 保持当前 `state.json`、handoff、receipt、ledger、audit projection 或 stage artifact 的向后兼容。
- 在 route 阶段提前冻结 design-owned 细节：字段级 schema、payload shape、error envelope、recovery payload、digest 算法细节。
- 在 route 阶段提前冻结 plan-owned 细节：task 拆分、exact argv、RED/GREEN 断言。
- 把本次治理 redesign 扩展成业务 OpenAPI / Spring Controller / Java product-path 变更；若后续 scope 扩到 `openapi/**` 或业务 controller，再单独补 API consistency 路由。

## 归属服务 / 模块 / 业务域
- Service: Enterprise Harness plugin/runtime governance core
- Module: workflow/runtime contract system（`harness/specs/**`、`runtime/lib/**`、`runtime/hooks/**`、stage skills/agents、change artifacts、audit/doctor evidence paths）
- Domain: governance / workflow orchestration / durable evidence

## 初步路由
- minimum-discovery 阶段曾把候选 tier 记为 `L1`，但该候选只反映早期探索占位，不足以覆盖当前已确认的 breaking governance scope。
- 结合 `requirements.md`、当前 exploration brief、`route.explore-code` execute 结果与独立 checker advisory，本次 authoritative route projection 上调为 `L3` 候选，等待主 orchestrator 向用户确认。

### Router 评分
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| Boundary breadth | 4 | 同一 service 内跨 `harness/specs`、runtime library、hooks、stage handoff、audit/doctor/evidence surface 的多层联动，不是单模块修补。 |
| Durable contract / data scope | 5 | `state.json`、handoff input/result、receipts、ledgers、audit projections、stage artifacts 全部在 scope 内，并允许 coordinated redesign。 |
| Interface / API contract breadth | 4 | intake/clarify、forked executor、independent checker、probe/hook、audit/doctor、resume/recovery 等多类 harness-facing interface 都会发生 breaking contract change。 |
| Architecture execution impact | 4 | inline clarify 与 forked follow-up stages 的执行边界、stage TECPC/checkpoint/auto-block、worktree snapshot/artifact import repair 都触达架构级执行模型。 |
| Governance / rule enforcement | 5 | TECPC completeness、CodeGraph-first receipts、ambiguity probing、registry/probe/hooks/checkers 强制化从软约束升级为 fail-loud runtime rule。 |
| Verification / recovery complexity | 4 | 需要统一 recoverable fail-loud contract、cross-artifact consistency 与 blocked/resume path，验证面覆盖 audit/doctor/workflow projection。 |
| **Overall** | **26 / 30** | 达到本仓库治理路由模型的 `L3` 阈值。 |

评分模型说明（仅适用于本仓库的 governance routing，不宣称是通用行业标准）：
- 单维分档：
  - `0` = 无影响或纯描述修正。
  - `1` = 局部、非权威、单文件/单文档修正。
  - `2` = 单模块内的加法或低风险 contract 调整，无阶段级联动。
  - `3` = 同层多模块变更，或单个 authoritative contract 发生实质调整。
  - `4` = 同一 service 内跨层联动，或 breaking change 触及多个 authoritative boundary。
  - `5` = 多个 authoritative contracts 联合重设计，且直接改变 blocking / recovery / audit 语义。
- Tier 阈值：
  - `L0`：总分 `0-4`，且所有维度 `<=1`，impact 四维均为 `no`。
  - `L1`：总分 `5-10`，最大单维 `<=2`，最多一个 impact 维度为 `yes`。
  - `L2`：总分 `11-18`，或存在单维 `3-4`，但仍是单一层面/有限联动，impact 为 `yes` 的维度不超过两个。
  - `L3`：总分 `>=19`，或任一维度为 `5`，或 impact 为 `yes` 的维度达到三个及以上，或目标本身是 authoritative governance contract 的 breaking redesign。
- 本变更命中 `L3` 的具体原因：总分 `26`；impact 四维全部为 `yes`；并且 scope 明确允许对 authoritative governance contracts 做 coordinated breaking redesign。

## 最小探索证据
- `harness/changes/EH-WORKFLOW-TECPC-20260806/requirements.md`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/evidence/minimum-discovery-exploration.md`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_8f644248-6630-4364-a22e-e2fa321759c9/result.json`
- `harness/changes/EH-WORKFLOW-TECPC-20260806/runs/run_cdd20df4-d5ca-404b-97c1-6d7ff0ed6e10/check.json`

## 最终路由
- Final tier: `L3`
- Owning service/module/domain: Enterprise Harness plugin/runtime governance core / workflow-runtime contract system / governance-workflow-durable-evidence domain
- Next stage after user confirmation: `design`（在主 orchestrator 取得用户对 route 的确认并通过 `workflow decide <change-id> confirm-route` 写入 `routeReady=true` 之后）
- Tier 依据必须与四个硬信号一致：
  - `API=yes`：本次不是业务 OpenAPI 变更，但它明确重设计 harness-facing interface contracts，包括 inline clarify、forked executor input/output、checker consumption、probe/hook、audit/doctor、resume/recovery 等边界；这些都是治理 API / contract 面，且为 breaking change。
  - `Data=yes`：本次直接作用于 authoritative durable contracts：`state.json`、handoff input/result、receipts、ledgers、audit projections、stage artifacts，以及它们之间的 digest/consistency/recovery 关系。
  - `Architecture=yes`：inline clarify 与 forked follow-up stages 的边界、stage TECPC/checkpoint/auto-block、worktree snapshot + artifact import repair、registration/probe/hooks/agents/checkers 的执行分层都要重构。
  - `Rule=yes`：TECPC completeness、CodeGraph-first evidence、ambiguity probing、fail-loud prerequisite enforcement、independent checker separation 都从软性流程要求升级为强治理规则。
- 由于四个硬信号全部为 `yes`，且 scope 是同一 service 内 authoritative governance contracts 的 coordinated breaking redesign，因此 `L1/L2` 都低估了真实 blast radius；最终候选 tier 应为 `L3`。

## 影响矩阵
| 维度 | 结论 | 依据 |
|------|------|------|
| API | yes | breaking harness-facing workflow contracts 与阶段边界（clarify、handoff、checker、probe/hook、audit/doctor、recovery）都在 scope 内。 |
| Data | yes | `state.json`、handoff、receipt、ledger、audit projection、stage artifact 等 durable contract 一并重设计。 |
| Architecture | yes | inline/forked 执行模型、checkpoint/auto-block、worktree snapshot/artifact import repair、registry/probe/hooks/checkers 编排都受影响。 |
| Rule | yes | TECPC、CodeGraph-first、ambiguity probing、evidence completeness、fail-loud gating 从指导语义转为 runtime-enforced rule。 |

## 需要确认的决策
- 用户需确认 route projection：`tier=L3`，impact=`api/data/architecture/rule = yes/yes/yes/yes`。
- design 需冻结统一 durable schema、digest/consistency model、authoritative source-of-truth 规则、error/recovery contract。
- design 需决定 WorktreeCreate / `ACTIVE_CHANGE` / artifact import repair 是否作为同一治理合同的一部分统一重构，以及 recoverable fail-loud 语义。
- design 需定义 ambiguity probing（information-gain / Socratic / Grill-Me）与 CodeGraph-attempt receipt/ledger 的统一 contract。
- plan 需冻结 route complexity 的可执行断言、task 分解、exact argv 与 checker sequencing。

## 假设
- 当前 scope 仍属单一 service（Enterprise Harness governance core）内部的跨层 redesign，不是跨服务 scope explosion。
- 无兼容性目标仍然有效；后续 design 不需要为了迁就旧合同而降低 fail-loud / auditable 要求。
- 即使没有 OpenAPI / HTTP controller，本次 harness-facing durable interface change 仍计入 `API=yes`；但这不自动触发 `api-consistency-reviewer`，除非后续 scope 扩到 OpenAPI、controller 或外部公共 API 契约。

## Waiver
- None.

## Requirement Review
- 已消费并吸收 `route.explore-code` 的独立 checker advisory：无证据要求回 clarify，且需要在 route.decide 中显式补消费 `requirements.md`、`state.json` 与当前 exploration brief 以修复 traceability。
- 本次写入只形成待用户确认的 route projection；`workflow.routeReady` 仍保持 `false`，不得由本执行者置位。
- 必需 reviewer / checker：
  - `requirement-reviewer`（route.decide 独立复核）
  - `design-reviewer`（design gate）
  - `plan-critic`（plan gate）
  - `implementation-reviewer`（tdd execute-task 独立实现复核）
  - `verification-reviewer`（verify gate）
- 条件性 reviewer：`api-consistency-reviewer` 仅在后续 scope 明确扩到 `openapi/**`、controller 或外部公共 API contract 时引入。
