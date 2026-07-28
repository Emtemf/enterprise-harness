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
| Test / rollback complexity | 5 | 需要 deterministic fixtures 与 authenticated clean-target E2E |
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
- 本机 Claude 已安装且已认证时 live E2E 必跑；CI 中无凭据时不冒充执行。
- archive/release acceptance 属于用户所要求“自动跑且可自检”的完成闭环，不包含发布或 push。

## Waiver
无。

## Requirement Review
首轮 verdict=block；按入口契约、事件语义、live E2E 与资产一致性 findings 修订后，
`requirement-reviewer` 独立复核 verdict=pass。
