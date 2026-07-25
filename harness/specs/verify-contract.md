# Verify Contract

## 目标

把 verify 阶段从“最后看一眼 validation.md”提升为统一消费 reviewer verdict、验证证据与完成态门禁的阶段 contract。

## 阶段职责

### `/harness-verify` skill
负责：
- 告诉用户当前 verify 要消费哪些证据
- 明确哪些 verdict / validation 仍缺失
- 汇总当前完成态 blocker
- 引导进入 archive 或返回上一步修订

### `verification-reviewer` agent
负责：
- 审查完成声明是否被新鲜验证证据支持
- 只读，不直接修实现
- 返回结构化 verdict

### 接缝层 / 原语层
负责：
- 校验 `validation.status`
- 校验 required reviewer verdict
- 校验 `changeId` / `reviewedAt` / verdict 可消费性
- 在 Stop / verify 中阻断伪完成

## Verify 输入 contract

至少包括：
- `validation.md`
- `state.json`
- reviewer verdict files
- 必要的测试 / build / check 输出摘要
- 当前 change 对应的 impact 信息

## Verify 最低要求

- `validation.md` 已补齐
- reviewer verdict 已落盘
- `validation.status=fresh`
- 对 required reviewer 的消费规则已满足
- 失败项 / 跳过项 / deferred 项已明确

## Verify 输出 contract

至少包括：
- `completion-verdict`：`pass` / `block` / `advisory`
- `blockers`
- `consumed-evidence-summary`
- `next-step`

### 输出语义

#### `completion-verdict=pass`
- 表示当前 verify 结论允许推进到 archive / completion gate
- `blockers` 应为空数组
- `next-step` 应指向 archive 或最终完成动作

#### `completion-verdict=advisory`
- 表示当前 verify 不阻断推进，但存在应记录的补强建议
- `blockers` 可为空
- `next-step` 应明确是“继续推进但记录 advisory”

#### `completion-verdict=block`
- 表示当前 verify 明确阻断推进
- `blockers` 不得为空
- `next-step` 应明确返回哪一步修订（如补 validation、补 reviewer、返回 tdd 或 plan）

## 与 double-check 的关系

verify 阶段不是单独再发明一套 review，而是统一消费：
- design-reviewer
- plan-critic
- api-consistency-reviewer（适用时）
- verification-reviewer

## Stop / completion gate 关系

verify 阶段通过后，仍需由 Stop / completion gate 做最终保护：
- stale validation → block
- 缺 required reviewer → block
- reviewer verdict 与 changeId 不匹配 → block

## 反模式

- 只有 `validation.md`，没有 reviewer consumption
- reviewer 跑过了，但 verify 不消费
- verification-reviewer 只给口头结论，不落盘 verdict
- 以旧验证结果冒充 fresh evidence
