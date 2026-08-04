---
name: harness-design
description: Enterprise Harness design 阶段。把已确认 requirements 转成接口、错误、数据/SQL、架构、兼容性和测试设计，并要求独立 design reviewer。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness Design

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 上下文边界

你在 forked subagent 中运行，没有主会话历史，也没有和用户对话的通道。

- 权威输入只有 change 目录里的 durable artifact，不是聊天记录。
- 需要用户决策时不要自问自答；在返回结果的 blockers 里写明待确认项，交主 orchestrator 去问。
- 你仍可派 executor 和 checker subagent，这是本阶段的核心要求。
- 返回给主 orchestrator 的是压缩结论，不是设计全文。

## 输入

- approved requirements
- scope confirmation、tier、impact
- relevant code/doc exploration
- `harness/templates/design.md`

## 动作

1. 若接口、数据或调用方事实不足，先生成 design exploration brief 并派只读 agent。
2. 创建 execute handoff，派 `design-executor`。
3. design 必须覆盖适用项：
   - goals/non-goals
   - component boundaries
   - API request/response/error/auth/idempotency
   - caller compatibility
   - schema、SQL、index、migration、rollback
   - concurrency/transaction
   - test strategy 和 observability
4. 创建 check handoff，派 `design-reviewer`。
5. blocker 修复后使用新 run 重审。

## 产出

- `design.md`
- exploration refs
- execute result
- `design-reviewer` verdict

## 阻断

- requirements 未确认
- API/data 适用但未设计
- 只有文本长度，没有可验证取舍
- reviewer 非 pass

## 下一阶段

design pass 后，主 orchestrator 必须执行：
```bash
enterprise-harness workflow decide <change-id> freeze-slice
```
此命令将 `designApproved` 置 true 并推进到 plan 阶段。若漏执行，state.json 的 gate 保持 false，链路会卡在 design。
长期合同见 `harness/specs/workflow.md`。
