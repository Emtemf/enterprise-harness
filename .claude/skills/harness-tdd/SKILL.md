---
name: harness-tdd
description: Enterprise Harness tdd 阶段。为当前 task 派隔离 tdd-executor，执行冻结的真实 RED/GREEN/REFACTOR argv，导入 receipt，再派独立 implementation reviewer。
user-invocable: false
context: fork
background: false
agent: general-purpose
---

# Harness TDD

由 plugin 入口 `/enterprise-harness:harness`（本仓库开发为 `/harness`）按当前 stage 加载。

## 上下文边界

你在 forked subagent 中运行，没有主会话历史，也没有和用户对话的通道。

- 权威输入只有 change 目录里的 durable artifact、task brief 和冻结 argv。
- 需要用户决策时在 blockers 里写明，交主 orchestrator 去问。
- 你必须派 `tdd-executor` 和 `implementation-reviewer`；不得自己实现或自审。
- 返回给主 orchestrator 的是压缩结论和 receipt refs，不是测试输出全文。

## 输入

- current task brief
- approved design/plan
- project command policy
- task exact argv
- active scoped handoff

## 动作

1. 创建 execute handoff。
2. 必须派 `enterprise-harness:tdd-executor`，使用 worktree isolation。
3. executor 依次通过 `tdd-run` 执行 RED、GREEN、REFACTOR。
4. RED 必须是具体断言非零；GREEN/REFACTOR 必须零。
5. Java/Maven 必须执行冻结的 `./mvnw` 或 `mvn` 命令。
6. executor 提交实现并返回 receipt refs、commit 和 changed paths。
7. 集成后运行 `evidence-import`。
8. 创建 check handoff，派 `implementation-reviewer`。

## 产出

- implementation commit
- durable TDD receipt
- executor result
- implementation reviewer verdict

## 阻断

- 主 orchestrator 自己实现
- worker 自报测试结果
- 无条件失败制造 RED
- argv 与冻结值不一致
- receipt/agent/worktree/digest 不一致
- reviewer block

## 下一阶段

所有 task 通过后进入 verify。详细合同见 `harness/specs/tdd-execution.md` 和 `harness/specs/evidence.md`。
