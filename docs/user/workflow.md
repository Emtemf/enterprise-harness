# 七阶段工作流

## clarify

目的：把需求变成可执行范围。

用户需要：逐次回答一个关键问题，并最终确认 scope。

成功表现：七维歧义评分全部有依据，关键维度均不低于 4。

阻断恢复：补充 weakest dimension，不要直接进入设计。

## route

目的：确定变更等级、影响面和所需 reviewer。

用户需要：确认 API、数据、架构和规则影响。

成功表现：tier、影响矩阵和执行路径落盘。

阻断恢复：补齐影响事实或明确 non-goals。

## design

目的：冻结实现前合同。

用户需要：确认关键取舍。

成功表现：适用的接口、请求响应、错误模型、SQL/迁移、兼容性和测试策略完整，并由独立 reviewer 通过。

阻断恢复：按 reviewer blocker 修改 design，再发起新的 check run。

## plan

目的：把 design 拆为可独立执行和验证的 task。

用户需要：确认顺序和交付边界。

成功表现：每个 task 有目标、文件范围、测试、RED 点、exact argv 和验收。

阻断恢复：拆小任务或补齐依赖。

## tdd

目的：用真实测试驱动实现。

用户需要：通常无需操作，除非构建命令或环境不明确。

成功表现：隔离 executor 按冻结 argv 完成 RED、GREEN、REFACTOR，并生成 receipt；独立 checker 检查结果。

阻断恢复：根据 receipt、runId 和错误码修复，不接受“已运行”的文本自报。

## verify

目的：消费所有 reviewer、receipt、ledger 和 fresh validation。

用户需要：确认剩余 advisory 是否接受。

成功表现：completion predicate 返回 pass，并列出消费的证据摘要。

阻断恢复：只修复结构化 blocker 指向的层。

## archive

目的：冻结完成变更并清理 active 指针。

用户需要：确认交付结论。

成功表现：change 物理移动到 archive，state 为 `ARCHIVED`。

阻断恢复：archive 与 Stop 使用同一个 completion predicate，不能手工改状态绕过。

## 上下文隔离

主 orchestrator 只负责阶段推进。代码探索、执行和检查分别在独立 subagent 中完成。worktree 提供文件隔离；subagent 提供上下文隔离；handoff artifact 提供可验证接力。
