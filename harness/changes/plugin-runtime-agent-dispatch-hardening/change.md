# Change

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

### 后续项（不在本次收敛范围）

- 为事后验证引入区别于 `tdd-run` 的 provenance（如 `post-hoc-verification`），
  需改 `tdd-receipts.mjs` 校验与 completion predicate。
- task review 必须绑定非空 `receiptDigest`，堵住「无执行证据即可 pass」的漏洞。

## Requirement Review
首轮 verdict=block；按入口契约、事件语义、deterministic fixture 与资产一致性 findings 修订后，
`requirement-reviewer` 独立复核 verdict=pass。
