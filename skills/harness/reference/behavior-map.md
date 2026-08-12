# behavior 速查

`<behavior>` 是 `stage.action` 格式，**不是 agent 名**。写错时 `pre-agent` hook 会 BLOCK 并打印正确命令。

| 想做什么 | 正确 behavior | 错误写法 |
|---|---|---|
| clarify 阶段探索代码 | `clarify.explore-code` | `code-explore` |
| clarify 阶段查外部文档 | `clarify.research-docs` | `doc-research` |
| clarify 阶段更新需求 | `clarify.synthesize` | `clarify-synthesizer` |
| route 阶段探索代码 | `route.explore-code` | `code-explore` |
| route 阶段路由决策 | `route.decide` | `route-decider` |
| design 阶段产出设计 | `design.produce` | `design-executor` |
| design 阶段探索代码 | `design.explore-code` | `code-explore` |
| 设计阶段查外部文档 | `design.research-docs` | `doc-research` |
| 设计阶段 API 检查 | `design.check-api` | `api-consistency-reviewer` |
| plan 阶段产出计划 | `plan.produce` | `plan-executor` |
| tdd 阶段执行任务 | `tdd.execute-task` | `tdd-executor` |
| verify 阶段收集验证 | `verify.collect` | `verification-executor` |
| verify 阶段 API 检查 | `verify.check-api` | `api-consistency-reviewer` |
| verify 阶段探索代码 | `verify.explore-code` | `code-explore` |

完整注册表：`harness/behavior-checks.json`
