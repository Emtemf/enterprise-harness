# 六阶段工作流

## 查看实际执行情况

不要只根据聊天中的“完成”判断进度。每个 change 都有可读、可复现的状态、审计和时序证据：

```bash
# 当前在哪个阶段、缺什么、现在唯一合法的推进决策是什么
enterprise-harness workflow status <change-id> --json

# 已完成阶段的文件、state、executor result、独立 checker result 是否都齐全
enterprise-harness workflow audit <change-id>

# 写代码前必须通过静态阶段链验证（ambiguity/router/design/plan/codegraph），落 stage-gate marker
enterprise-harness validate <change-id>

# 从真实 agent ledger 渲染实际发生过的时序图，而不是理想流程图
enterprise-harness trace --change <change-id> --mermaid
```

`workflow audit` 返回 `0` 表示已完成阶段的证据符合合同；返回 `2` 表示有阻断项，输出会明确
指出缺少的 artifact、execute result、checker result、parent run 关联或 state predicate。

`validate` 在 plan 冻结后、tdd 写代码前运行一次：它验证静态阶段链完整性并写入
`evidence/stage-gate.json`。之后写受治理路径（`src/main/java`、`src/test/java`、`openapi`）
时，pre-write 门禁只轻查这个 marker 是否存在且未过期，不再每次写文件全量重算阶段链。
若 marker 缺失或阶段链证据变化，pre-write 会阻断并提示先运行 `validate`。

读取 `workflow status --json` 或普通 `status --json` 时先看顶层字段。若 `status=blocked`，
不要根据 `stage`、`nextStage` 或 `projectedNextEntry` 继续执行；此时只执行顶层 `nextAction`，
并按 `blockers[0]` 修复最早的证据缺口。只有非 blocked 状态下，才可采用
`pendingDecision.options` 中的阶段决策。
普通 status 在阻断态会令 `nextStage=null`；`projectedStage` 只是原 state 的只读解释。

从 schema 4 开始，archive、Stop 和最终 completion 会强制执行相同审计：不能只修改
`state.json` 把 change 标成完成。需要完整的事件、文件、角色边界和磁盘路径说明时，见
[阶段时序、事件与产物合同](../../harness/specs/stage-observability.md)。

## clarify

目的：把需求变成可执行范围。

用户需要：逐次回答一个关键问题，并最终确认 scope。澄清问题使用 Claude Code 原生 `AskUserQuestion`，每轮只呈现最弱的一个维度，并把推荐选项放在第一项。

成功表现：七维歧义评分全部有依据，关键维度均不低于 4。

阻断恢复：补充 weakest dimension，不要直接进入设计。

## classification（clarify 内部动作）

目的：确定变更等级、影响面和所需 reviewer。

用户需要：确认 API、数据、架构和规则影响。

成功表现：tier、影响矩阵和执行路径落盘。

阻断恢复：补齐影响事实或明确 non-goals。

## design

目的：冻结实现前合同。

用户需要：确认关键取舍。

成功表现：适用的接口、请求响应、错误模型、SQL/迁移、兼容性和测试策略完整；高影响决定还记录
替代方案、可逆性、owner、观测、回滚与重新评估触发器，确保三个月后仍可理解和替换，并由独立
reviewer 通过。

阻断恢复：按 reviewer blocker 修改 design，再发起新的 check run。

## plan

目的：把 design 拆为可独立执行和验证的 task。

用户需要：确认顺序和交付边界。

成功表现：按可观察价值和风险切成小而可评审的 vertical slices；每个 task 有目标、依赖、文件范围、
strategy、exact argv、验收与 recovery。只有 TDD task 要求真实 RED。

阻断恢复：拆小任务或补齐依赖。

## implement

目的：按冻结 strategy 用最小变更和真实反馈循环实现；TDD 只是适用策略之一。

前置：静态阶段链必须已通过 `enterprise-harness validate <change-id>` 并落 marker。若
marker 缺失，第一次写受治理路径会被 pre-write 阻断。

用户需要：通常无需操作，除非构建命令或环境不明确。

成功表现：隔离 implementer 按冻结 strategy/argv 生成 execution receipt 和逐路径 output snapshot；
独立 checker 先检查隔离输出，pass 后 Main 把 reviewed output 接入 subject checkout，再运行
`enterprise-harness task-integrate <change-id> <task-id> <review-run-id>` 发布绑定该 review 的
integration receipt。TDD task 的 RED 必须是目标断言的
真实非零失败，不能用无条件退出伪造。

阻断恢复：根据 receipt、runId 和错误码修复，不接受“已运行”的文本自报。若被
pre-write 以 `stage-evidence-digest-mismatch` 阻断，说明阶段链证据（plan/reviews）已
变化，重新运行 `validate` 后再写。

## verify

目的：从风险和 completion claims 出发，消费所有 reviewer、receipt、ledger 和 fresh validation；
基础测试通过不能覆盖缺失的负向、安全、迁移或回滚证据。

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
