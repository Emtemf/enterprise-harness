# Change

## 终局状态：FROZEN（2026-07-30）

本 change 已停止推进，不再接收新工作。它**无法归档**，原因有二，且都不应通过修改状态绕过：

1. completion predicate 有 10 个 blocker（3×`EH-COMPLETION-REVIEW-114`、4×`EH-COMPLETION-TDD-109`、
   state/freshness/digest 各一）。`lifecycle archive` 复用同一谓词，任何绕过都是伪造证据。
2. `harness/plugin/runtime/test/` 中 3 个 smoke 硬编码引用本 changeId
   （`cumulative-write-gate`、`tdd-receipt-contract`、`tdd-run-baseline`），归档会破坏 smoke。

不使用 `REJECTED`：本 change 的产出已真实发布（0.2.30–0.2.33），拒绝态会错误描述历史。
`state` 保持 `EXECUTING`，`tddStatus` 保持 `not-started`——这两个字段如实反映证据现状。

### 已交付并发布

- Task 1：authoritative evidence foundation（完整 TDD receipt，唯一证据齐全的 task）
- Task 2–4：canonical entry / scoped dispatch、cumulative gates、release acceptance
  （实现与 review 存在，TDD receipt 缺失，见 W-1）
- Task 5 范围内的三项治理修复，于 0.2.33 发布：失败派发不再阻断 TaskCompleted、
  `EH-COMPLETION-REVIEW-114`、route 与 clarify 分离

### 不可恢复的缺口

- task-2/3/4 的先红后绿证据链永久缺失（W-1）
- task-5 无 TDD receipt：其内容由主 orchestrator 在 main 上直接以 TDD 方式完成，
  未走 `tdd-run` 冻结 argv、未派隔离 executor。这与 W-1 是同类问题，
  但成因不同——见下方 W-2。

### 后续工作去向

均以独立小 change 承接，不在本 change 内继续：

- 事后验证 provenance（区别于 `tdd-run`）
- 解除 3 个 smoke 对本 changeId 的硬编码依赖，之后本 change 方可归档
- L0/L1 轻量通道（见 W-2）

## 原始需求
按 Claude Code 官方要求规范修复当前插件的 subagent 驱动与阶段门禁，并提交代码。

## 业务结果
Enterprise Harness 在 clean plugin-only 环境中能够进入真实 orchestrator、派发确定性的 scoped
agents，并以 agent-aware hook 和可信执行 receipt 阻止手填状态、主线程探索/写入、伪 Maven
证据与弱 archive 条件。

## 非目标
- 不构建独立于 Claude Code 的 fat runtime Agent runner。
- 不修改 reference-service 业务实现。
- 不在本 change 发布 Release 或 push 远端。
- 不扩展全部 DFX 模板。

## 归属服务 / 模块 / 业务域
Claude Code plugin surface、hook adapter、workflow primitives、verification/release acceptance。

## 初步路由
L3。

### Router 评分
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| Scope complexity | 5 | 入口、skills、agents、hooks、runtime、CI 跨层 |
| Impact breadth | 5 | 影响所有安装后的 staged workflow |
| Unknowns / ambiguity | 3 | 官方事件字段明确，live/cache 行为需 E2E |
| API / data risk | 2 | 无业务 API/数据变化，但有插件运行接口兼容风险 |
| Test / rollback complexity | 5 | 需要 deterministic clean-target、handoff 与 hook fixtures |
| **Overall** | 4.0 | L3，且 architecture/rule hard signal 均为 yes |

## 最小探索证据
- CodeGraph 索引：182 files / 3074 nodes / 4940 edges，up to date。
- runtime 仅返回 logical lane，不实际派 Agent。
- live plugin-only 探针：scoped Agent 成功，bare subtype 不稳定；同名 command 遮蔽 skill。
- Claude 官方 plugins/skills/subagents/hooks 文档。

## 最终路由
L3：clarify → route → design → plan → tdd → verify → archive。

## 影响矩阵
| API | Data | Architecture | Rule |
|-----|------|-------------|------|
| no | no | yes | yes |

## 需要确认的决策
首批冻结为入口、scoped dispatch、agent-aware cumulative gates、可信 TDD receipt、
completion/archive 与 release acceptance。

## 假设
- Claude Code 2.1.220 作为当前兼容基线。
- standalone source checkout 的入口是 `/harness`；plugin-only canonical 入口是
  `/enterprise-harness:harness`，不为 plugin 制造非官方裸 alias。
- 插件验收只消费 deterministic plugin/hook fixtures，不读取 Claude 账户或认证状态。
- archive/release acceptance 属于用户所要求“自动跑且可自检”的完成闭环，不包含发布或 push。

## Waiver

### W-1：task-2/3/4 缺少可导入的 TDD receipt（2026-07-30 记录）

事实：

- `evidence/tdd/` 只有 `task-1.json`。全分支 git 历史中该目录仅被写入过一次（`34fdaf9`）。
- task-2 在 spool 留有四份 `provenance=tdd-run` 的真实执行 receipt
  （`task-2-review0/1/2/3-invalid.json`），均记录 `RED=1, GREEN=0, REFACTOR=0`，
  argv 与冻结矩阵一致。但没有任何一份被提升为权威 `task-2.json`，
  `evidence-import` 因此返回 `BLOCK: invalid TDD spool: receipt is missing`。
  `task-2-review2.json` 绑定 `head=f3209b6`，早于最终实现 commit `beca73c`，
  其后的代码改动无执行证据覆盖。
- task-3、task-4 在 spool、worktree 残留与 git 历史中均无任何执行 receipt。
  实现 commit（`f1217c0`、`2c0ce2c`）与 review pass 存在，执行证据从未存在。
- `reviews/code-reviewer-task2/3/4.json` 的 `receiptDigest` 均为 `null`，
  即当时的 task review 未绑定任何执行 receipt 即给出 pass。

结论：

task-2/3/4 的先红后绿证据链已永久不可恢复。事后重跑只能证明「当前代码通过测试」，
不能证明「由测试驱动写出」。因此本次收敛**不补录 receipt**：在缺少区分性 provenance 的
前提下导入，会使补录证据与 task-1 的真实全链路 receipt 无法区分，等同伪造。

已执行的替代验证（仅作当前正确性证明，不具 TDD receipt 效力）：

- `node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs verify` → PASS
- `node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify` → PASS

因此 `workflow.tddStatus` 保持 `not-started`，不因替代验证而推进。该字段是当前唯一
如实反映证据状态的投影。

### W-2：Task 5 内容未经隔离 executor 执行（2026-07-30 记录）

事实：

- 0.2.33 的三项治理修复（`task-completed.mjs` 失败派发恢复、`EH-COMPLETION-REVIEW-114`、
  route/clarify 分离）落在 Task 5 的声明范围内。
- 它们由主 orchestrator 直接在 main 上完成：先写失败测试、确认 RED、最小实现、确认 GREEN、
  全量套件 0 失败、`claude plugin validate` 与 `prepublish-check` 通过。
- 但**未**通过 `tdd-run` 执行冻结 argv，**未**派 `tdd-executor` 隔离 executor，
  因此没有产生可导入的 receipt，也没有独立 implementation reviewer verdict。

成因（与 W-1 不同）：

Task 5 的 Verification Commands 段只列了 smoke 命令，未像 Task 1–4 那样冻结
`tdd-run` wrapper argv，也未进入 Allowed argv matrix。plan 层缺口使得执行时没有可用的冻结命令。

更根本的问题：本仓库的受治理路径 gate 针对 `src/main/java/**` 等业务路径，而修改
`harness/plugin/runtime/**` 自身时，SOP 要求的隔离 executor 在实践中会与「正在被修改的
runtime 就是执行 SOP 的 runtime」冲突。这属于产品缺口，不是执行纪律问题——见后续
L0/L1 轻量通道工作项。

结论：

不事后补录 receipt（理由同 W-1：重跑只能证明当前代码通过测试，不能证明测试驱动）。
本条如实记录执行方式，供后续审计。


- 为事后验证引入区别于 `tdd-run` 的 provenance（如 `post-hoc-verification`），
  需改 `tdd-receipts.mjs` 校验与 completion predicate。
- task review 必须绑定非空 `receiptDigest`，堵住「无执行证据即可 pass」的漏洞。

## Requirement Review
首轮 verdict=block；按入口契约、事件语义、deterministic fixture 与资产一致性 findings 修订后，
`requirement-reviewer` 独立复核 verdict=pass。
