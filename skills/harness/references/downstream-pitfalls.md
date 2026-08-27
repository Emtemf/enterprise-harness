# 下游坑点与交接检查清单

加载时机：当前阶段准备自检、独立评审、恢复或交接到下一阶段时。
返回控制器：只返回当前阶段命中的坑点、证据引用和一个恢复动作；不要在同一轮推进下一阶段。

本文件是跨阶段唯一共享清单。它帮助发现常见偏航，不增加 lifecycle stage，也不替代各阶段 runtime gate、schema、rubric 或 CompletionProof。

| 阶段 | 常见坑点 | 如何发现 | 交接前必须看到 | 恢复动作 |
|---|---|---|---|---|
| Clarify | fact lane 未完成就提问；把实现方案当需求；API/Data/认证面机械扩张；歧义只凭印象；技术债借机扩 scope | required packet pending/stale；问题可由代码或官方文档回答；component 是字段/文件；predicate 无独立 evidence；债务无触达位置 | topology 已确认；歧义指数、最低维度分数与高风险未决数可见；每个 predicate 绑定 Evidence ledger；scope/debt/project contract 已处置 | 回到最早失效的 research 或 decision frontier，一次只解决一个事实缺口或用户决策 |
| Design | 需求追踪断裂；过早冻结类/文件；适用 API、SQL、迁移、回滚、测试设计缺失；设计者自批 | R* 无 design trace；实现细节无需求依据；impact 分支未处置；review run 与 execute run 不独立 | 每个 R* 有设计映射；服务/接口交互、错误模型及适用 API/Data/SQL/迁移/回滚/测试策略完整；self-check 与独立 ReviewResult 新鲜 | 返回 design worker 修正制品并重新生成摘要绑定的 StageResult，再创建新 review run |
| Plan | task 不是独立可验收单元；write scope 或 exact argv 模糊；strategy 与证据链不匹配；SQL 变更没有归档路径 | 出现“相关测试/按需修改”；task 跨多个不可独立结果；TDD 无 RED、migration 无回滚；SQL 只存在聊天中 | 每个 task 有稳定 ID、输入输出范围、写入路径、单一 strategy、exact argv、验收、recovery、reviewer 输入；SQL/迁移落在 durable artifact | 重新拆 task 或修正 strategy/argv，冻结新 plan digest 后重新独立评审 |
| Implement | 绕过 task runner；伪造 RED/receipt；修改冻结范围外文件；一个 worker 串行承担所有 task；worktree 被误当 reviewer 独立性 | argv 与计划不一致；receipt 手写或缺 stdout/stderr digest；changed paths 越界；review 复用 executor run | 真实策略阶段回执、最小实现、范围内 diff、task self-check、不同 run 的独立 ReviewResult | 停止后续 task；在隔离 worktree 中从失败策略阶段重跑，或回 Plan 变更冻结合同 |
| Review | 只看聊天总结；reviewer 与作者不独立；rubric 未按 classification 选择；发现问题却给 pass | review 未绑定 artifact/result digest；runId/agent 相同；缺 rubricIds；`pass` 仍有 correction | digest-bound 输入、正确 rubrics、逐项 verdict 与证据、`block/unsupported` 的可执行 correction、独立身份 | 创建新的独立 check run；输入变化后废弃旧 ReviewResult，禁止就地改 verdict |
| Verify / E2E | 只跑单测；E2E 与验收流程脱节；浏览器工具选择先于场景；stale/skip/unsupported/waiver 被当 pass | R* 没有 validation 映射；关键用户流程无可观察断言；工具没有可复现 argv/版本；输入 digest 已变 | 冻结 validation argv；每个 R* 的 fresh 结果；适用时有 E2E 场景、环境前置、数据清理与可观察断言；所有例外显式阻断或有可信用户授权 | 从最早 stale validation 重跑；若能力或环境缺失，保留 unsupported 并返回一个明确 blocker，不降格完成标准 |
| Archive | 用聊天“完成”代替 CompletionProof；部分发布或活动指针未清理；覆盖历史目录；归档后继续修改 | proof digest 不匹配；archive 目标已存在；lifecycle/active pointer 与物理目录不一致 | fresh Verify 与 Archive CompletionProof、独立评审、CAS 成功、不可变目标、清理结果 | 停止物理移动；按 runtime recovery 修复证据或状态；无法完成时走有原因和证据的 abandon |

## 使用规则

1. 只检查当前阶段及紧邻交接项，不把整表复制进 StageResult。
2. 每个命中项必须给出 durable evidence ref；没有证据时写 blocker，不能写“已规避”。
3. 坑点导致输入或 digest 变化时，旧自检、ReviewResult、validation 与 CompletionProof 一律视为 stale。
4. 这是一份负知识入口：本版本只保留可操作检查，不实现跨项目学习、RAG、意图识别或自动纠错模型。
