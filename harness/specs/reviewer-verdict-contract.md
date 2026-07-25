# Reviewer Verdict Contract

## 目标

把 reviewer 输出从“结构化建议”进一步收敛成可被 verify / stop / completion gate 机械消费的最小 schema contract。

## 适用范围

适用于以下 reviewer：
- requirement-reviewer
- design-reviewer
- plan-critic
- api-consistency-reviewer
- verification-reviewer

## 最小字段

review verdict 至少包含：
- `changeId`
- `reviewerId`
- `verdict`：`pass` / `block` / `advisory`
- `findings`
- `evidence`
- `reviewedAt`

## 字段语义

### `changeId`
- 必须与目标 change 一致
- 不得为空
- verify / stop 会消费它做对齐检查

### `reviewerId`
- 必须稳定标识当前 reviewer 角色
- 应与 repo contract 中声明的 reviewer 名称保持一致

### `verdict`
- `pass`：当前 reviewer 不阻断推进
- `advisory`：不阻断推进，但必须可追溯
- `block`：阻断推进，必须由下游消费层中止完成态或阶段推进

### `findings`
- 可为空数组
- `block` 时通常不应为空
- 应以可复核的问题点为主，而不是泛泛结论

### `evidence`
- 必须说明 reviewer 基于哪些输入/证据做出结论
- 至少应可追溯到相关 artifact / 命令输出 / 文件

### `reviewedAt`
- 不得为空
- 用于证明 verdict 具有当前会话/当前 change 的可消费时间锚点

## 机械消费要求

以下情况视为 reviewer verdict 不可消费：
- `changeId` 缺失
- `reviewerId` 缺失
- `verdict` 缺失或不在 `pass|block|advisory` 中
- `reviewedAt` 缺失
- required reviewer 缺失
- required reviewer verdict 为 `block`

## 与 verify / stop 的关系

### verify
verify 阶段统一消费 reviewer verdict，并结合 validation freshness 决定是否允许完成声明成立。

### stop
stop hook 作为最终完成态保护层，必须阻断：
- required reviewer 缺失
- required reviewer verdict 不可消费
- required reviewer verdict=`block`

## 反模式

- reviewer 只给口头结论，不落盘
- `verdict` 有值，但 `reviewedAt` 为空
- `changeId` 与当前 change 不匹配
- 以 advisory 伪装 block，或以 pass 掩盖 blocker
