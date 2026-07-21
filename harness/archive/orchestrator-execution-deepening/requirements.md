# Requirements

## 原始需求

在 `clarify-first-staged-orchestrator` 第一版 contract / template / worker / guidance / workflow-state 骨架已经完成后，继续把主线从“骨架可验证”推进到“真实执行阶段更可用”，尤其收紧 `/harness` 背后的 workflow runner、自动阶段推进与 automation-first progression。

## 澄清后的目标

本轮不再重复收口用户入口，也不再补第一版骨架 contract；本轮目标是把已经存在的 clarify-first staged orchestrator 主线推进到**更真实的执行期行为**，至少覆盖：

1. workflow runner 在真实 active change 上的 run / resume / status / decide 行为深化
2. `/harness` 与 runtime helper 对“当前阶段 → 下一步动作”的自动推进能力更稳定
3. automation-first progression 在不要求用户理解后台命令的前提下继续增强
4. 让下一轮真实执行任务更少依赖人工解释当前状态

## 范围

- `harness/plugin/runtime/workflow.mjs`
- `harness/plugin/runtime/lib/workflow.mjs`
- `harness/plugin/runtime/lib/status-summary.mjs`
- `harness/plugin/runtime/hooks/session-start.mjs`
- `harness/plugin/runtime/hooks/stop.mjs`
- `.claude/skills/harness/SKILL.md`
- 相关 workflow / status / decision / guidance smoke
- 本 change 的 requirements / design / tasks / validation / reviews / state

## 非目标

- 不重复做 `runtime-installability-polish` 的用户入口文案收口
- 不重复做 `clarify-first-staged-orchestrator` 第一版骨架 contract/template 收口
- 不在本轮扩展 Java sample / OpenAPI / business feature 实现
- 不在本轮展开公共 marketplace / distribution productization

## 关键参与者 / 用户 / 调用方

- 普通用户：只从 `/harness` 进入，不应理解后台命令
- `/harness` orchestrator
- workflow runner (`run` / `resume` / `status` / `decide`)
- SessionStart / Stop / status surface
- active change state consumer

## 业务上下文

当前项目已经完成：

- 普通用户入口 `/harness` 收口
- `clarify-first-staged-orchestrator` 第一版骨架验证收口

当前真正缺口不再是文档和 contract，而是：

- workflow runner 在真实 change 上的自动推进是否足够稳定
- `/harness` 是否能进一步减少用户对当前阶段的判断负担
- state / runner / guidance 是否在更真实的执行场景里一致

## 约束

- 继续保持普通用户唯一前门为 `/harness`
- codegraph-first / Context7-first 规则继续有效
- 本轮默认仍不让普通用户接触 runtime CLI 细节
- 若涉及新的状态推进语义，必须留下 machine-readable evidence

## 接口 / API 关注点

- `/harness` 的 stage routing 与恢复入口
- `workflow run|resume|status|decide` 的 machine-readable 结果
- SessionStart / Stop / status 的当前阶段与下一步动作表达

## 数据 / SQL 关注点

- 不适用；本轮不涉及业务数据或 SQL。

## 验收标准

- 新 change 的最终 design / tasks 必须明确 workflow runner execution scope
- 至少一组新的 execution/deepening smoke 能证明 runner/guidance 真实行为增强
- `/harness` 不需要用户手工判断“现在该去哪个阶段”
- 相关验证证据可被 `validation.md` 消费

## Repo / 文档事实依据

- `harness/changes/clarify-first-staged-orchestrator/validation.md`
- `harness/plugin/runtime/workflow.mjs`
- `harness/plugin/runtime/lib/workflow.mjs`
- `harness/plugin/runtime/lib/status-summary.mjs`
- `harness/plugin/runtime/hooks/session-start.mjs`
- `.claude/skills/harness/SKILL.md`

## 用户确认

- 状态: implied-by-continue-goal
- 已确认范围: 在骨架收口后继续推进主线 execution deepening，而不是停在当前完成态
- 备注: 用户明确表示“那你继续推进呀”“我愿意啊，你优化就好了”。
