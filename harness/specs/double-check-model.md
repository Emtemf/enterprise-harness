# Double-check Model

## 目标

把“我们有 reviewer / verifier”升级成一个可机械理解的闭环模型，而不是礼貌性建议系统。

## 一句话模型

主执行 → 独立复核 → 统一消费 → 完成态门禁

## 适用范围

适用于以下阶段：
- design
- plan
- tdd / verify
- stop / completion

## 角色分工

### 主执行层
负责：
- 产出 design / tasks / implementation / validation 初稿
- 提供当前阶段最小可消费产物

### 独立复核层
负责：
- 以 reviewer / critic / verification 角色做独立判断
- 不直接改实现
- 返回结构化 verdict

### 统一消费层
负责：
- 在 `/harness` 或 verify 阶段消费 verdict
- 决定是 pass / revise / block
- 更新 state / approvals / validation / next entry

### 完成态门禁层
负责：
- Stop / verify 阶段阻断未闭环完成态
- 防止 stale validation、缺 reviewer、缺 verdict 的伪完成

## 各阶段映射

### design
- 主执行：`/harness-design`
- 复核：`design-reviewer`
- 消费：design gate
- 阻断：未批准不得进入 plan

### plan
- 主执行：`/harness-plan`
- 复核：`plan-critic`
- 消费：plan gate
- 阻断：未通过不得进入 tdd

### tdd / verify
- 主执行：`/harness-tdd` + executor
- 复核：`verification-reviewer` / verify phase
- 消费：validation + verdict
- 阻断：未 fresh / verdict 缺失不得完成

## Verdict contract

reviewer 输出至少包括：
- reviewer id
- change id
- verdict：`pass` / `block` / `advisory`
- findings
- evidence
- reviewedAt

## 消费规则

### pass
- 可推进到下一 gate / stage
- verify 输出中的 `completion-verdict` 应为 `pass`
- `next-step` 指向 archive / completion gate

### advisory
- 不阻断推进，但必须可追溯
- verify 输出中的 `completion-verdict` 应为 `advisory`
- `next-step` 应明确“继续推进并记录 advisory”

### block
- 阻断推进
- 必须记录 blocker / 恢复动作 / 下次入口
- verify 输出中的 `completion-verdict` 应为 `block`

## 机械消费点

- design gate
- plan gate
- verify stage
- stop hook
- completion review check

## 反模式

### 1. reviewer 只给口头结论
后果：无法被 verify / stop 机械消费。

### 2. reviewer 既审又改
后果：角色混淆，double-check 失真。

### 3. 有 reviewer，但没有统一消费层
后果：review 变成礼貌性建议，不形成闭环。

### 4. 完成态不看 freshness / reviewer
后果：伪完成。
