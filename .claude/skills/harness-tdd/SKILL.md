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

- current task brief（含 taskId、touched files、frozen argv）
- approved design/plan + `task-commands.json`
- active scoped handoff（`HANDOFF_INPUT=<path>`）

## 前置：静态阶段链验证

tdd 写受治理路径前，stage-gate marker 必须已落盘：

```bash
enterprise-harness validate <change-id>
# fallback：
node runtime/cli.mjs validate <change-id>
```

marker 缺失时先补跑，再继续 tdd。

## 动作

1. 创建 execute handoff：
   ```bash
   enterprise-harness handoff create <change-id> tdd tdd.execute-task execute
   ```
2. 派 `enterprise-harness:tdd-executor`（**必须** worktree isolation）。
3. executor 依次通过 `tdd-run` 执行 RED → GREEN → REFACTOR：

   ```bash
   enterprise-harness tdd-run <change-id> <task-id> red   -- <frozen argv>
   enterprise-harness tdd-run <change-id> <task-id> green -- <frozen argv>
   enterprise-harness tdd-run <change-id> <task-id> refactor -- <frozen argv>
   # fallback：node runtime/cli.mjs tdd-run ...
   ```

4. executor 提交实现并返回 receipt refs、commit 和 changed paths。
5. 用 executor runId 创建 check handoff，派 `implementation-reviewer`。
6. reviewer pass 后，主 orchestrator 集成 implementation commit，执行：
   ```bash
   enterprise-harness evidence-import <change-id> <task-id>
   # fallback：node runtime/cli.mjs evidence-import <change-id> <task-id>
   ```

## Receipt 约束

| 步骤 | exit code 要求 | 含义 |
|------|---------------|------|
| RED | **非零** | 目标断言真实失败，不得无条件退出伪造 |
| GREEN | **零** | 最小实现通过 |
| REFACTOR | **零** | 重构后仍通过 |

receipt 绑定：change/task、scoped executor `agent_id`、worktree path、git common dir、HEAD before/after、tree digest before/after、exact argv、exit code、开始/结束时间、stdout/stderr digest。

> tdd 阶段写 `evidence/tdd/**` 和 receipt 不使 stage-gate marker 失效。
> 若重新设计或改 plan（reviews 或阶段链证据变化），须重新 `validate`。

## HANDOFF_RESULT 格式

executor 和 checker 末尾必须输出：

```
ENTERPRISE_HARNESS_HANDOFF_RESULT
{ "handoffVersion":1, "runId":"...", "changeId":"...", "stage":"tdd",
  "behavior":"tdd.execute-task", "role":"execute|check",
  "agent":{"type":"enterprise-harness:tdd-executor","skill":"harness"},
  "tecpc":{"target":"...","evidence":[...],"context":[...],"path":"...","correction":"..."},
  "outputRefs":[...], "blockers":[], "summary":"..." }
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

checker 额外需要 `"role":"check"` 和 `"verdict":"pass|block|advisory"`。

## 产出

- implementation commit（scoped executor）
- durable TDD receipt（`evidence/tdd/<task-id>.json`）
- executor result.json + implementation reviewer check.json

## 阻断条件

- orchestrator 自己实现代码
- worker 自报测试结果（无真实 receipt）
- RED 为无条件 `exit 1` 而非真实断言失败
- argv 与 `task-commands.json` 冻结值不一致
- receipt/agent/worktree/digest 不一致
- reviewer block

## 下一阶段

所有 task 通过后：

```bash
enterprise-harness workflow decide <change-id> enter-verify
```

前置：`tddStatus` 已由真实 receipt 推进到 `refactor-verified`。未达到时该决策不出现，需先补齐证据。返工用 `revise-task`。
