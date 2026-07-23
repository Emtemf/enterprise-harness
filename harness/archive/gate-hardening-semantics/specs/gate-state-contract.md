# Gate State Contract

## 目标

冻结 issue #11 在当前 change 范围内的最小 gate/state/asset 消费模型，避免后续实现阶段继续猜测：

- 哪些是 state
- 哪些是 gate key
- 哪些只由 artifact presence 表达
- 哪些由 reviewer verdict / validation freshness 消费

## 当前选定模型

### 1. `DESIGN_APPROVED`
- 仍然保留为 workflow state
- `gates.designApproved=true` 继续作为受治理写路径的 runtime 消费 key
- 进入 `DESIGN_APPROVED` 的前提：
  - `design.md` 存在
  - `reviews/design-reviewer.json` 存在且 verdict 不为 `block`
  - lifecycle 明确标记 `design-approved`

### 2. plan/task gate
- 当前不新增 `planApproved` 布尔 gate key
- 以 `TASKED` 作为计划/任务已可消费的唯一状态表达
- `tasks.md` 可以在 `DESIGN_APPROVED` 之前以 draft 形式存在，但不可作为进入实现的依据
- `tasks.md` 的最小 header 语义应区分：
  - `# Draft Tasks (Pending Design Approval)`
  - `# Tasks`
- 进入 `TASKED` 的前提：
  - `tasks.md` 已从 draft 变为正式 `# Tasks`
  - `reviews/plan-critic.json` 存在且 verdict 不为 `block`
  - 至少有一组可执行 task 路径、RED/GREEN/verification 命令与 review 输出路径
- 当前 change 中，`TASKED` 的判定不依赖 machine-readable task schema；若后续需要 schema，另开增量 change

### 3. task execution gate
- `EXECUTING` 表示某个具体 task 已开始消耗
- 进入 `EXECUTING` 时，`currentTask` 应指向当前活动任务
- 当前 issue #11 第一阶段暂不要求 `pre-write` 消费 `state >= TASKED`；该问题显式 deferred 到后续实现决定中，避免在 design 未冻结前先收紧写路径

### 4. reviewer verdict consumption
- `verify` 是 reviewer verdict 与 state/artifact 关系的主要机械消费点
- `pre-write` 只负责写入时高价值阻断，不承担全部 reviewer matrix 消费
- `stop` 只负责结束前 freshness / 完成态保护，不承担 design/plan 语义消费
- blocking reviewer 缺失规则：
  - `design-reviewer`：进入 `DESIGN_APPROVED` 前必须存在且不为 `block`
  - `plan-critic`：进入 `TASKED` 前必须存在且不为 `block`
  - `verification-reviewer`：进入 `VALIDATED` 前必须存在且不为 `block`
- 条件适用 reviewer：
  - `api-consistency-reviewer` 仅在 `impact.api=yes` 时 mandatory
  - `impact.api=no` 时，缺失该 reviewer verdict 不 block

### 5. validation freshness consumption
- `validation.status=fresh` 是 `VALIDATED` 的必要条件
- `REVIEWED` / `VALIDATED` 状态都不应在 stale validation 下结束
- verification-reviewer 的 blocking verdict 应阻止进入或保持 `VALIDATED`

## Blocking Reviewer Matrix

| Reviewer | 必要阶段 | 缺失时行为 |
|---|---|---|
| requirement-reviewer | `CHANGE_APPROVED` 之前 | 当前阶段允许 requirement routing 先人工完成，但进入长期机械消费时应补齐 |
| design-reviewer | `DESIGN_APPROVED` 之前 | block |
| plan-critic | `TASKED` 之前 | block |
| api-consistency-reviewer | 仅 `impact.api=yes` 的 `REVIEWED` / `VALIDATED` 之前 | `impact.api=yes` 时 block；否则 not-applicable |
| verification-reviewer | `VALIDATED` 之前 | block |

## 兼容策略

### 允许的过渡
- 历史 change 若尚无完整 reviewer verdict，可先继续保持 warning/人工补齐路径
- draft `tasks.md` 可以存在，但不得被当作正式 task gate 依据

### 不允许的过渡
- 未 design-approved 直接把 tasks 当成 plan-ready
- reviewer verdict 为 `block` 但仍推进到对应受阻 state
- validation stale 仍宣称 change 完成

## 结论

当前 change 后续实现应围绕这个 contract 收紧 rules/specs/runtime，而不是继续引入新的未定 gate key。
