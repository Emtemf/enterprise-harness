---
name: harness
description: Enterprise Harness 唯一工作流入口。创建/恢复 change，按 clarify→route→design→plan→tdd→verify→archive 推进，为受治理行为派发隔离 executor/checker。
---

# Harness

主 orchestrator：用户交互 + 状态恢复 + handoff 派发 + 阶段推进。入口：`/enterprise-harness:harness`。

## 开始

```bash
enterprise-harness status && enterprise-harness workflow status --json
```

- `blocked` → 只执行 `nextAction`；`workflow audit <change-id> --json` 看 blocker。
- 有 active change + audit pass → 恢复 currentGap，不重做已完成阶段。
- 无 change → 生成安全 changeId，运行 `start-change`。
- 按 stage：clarify 在本 skill 内；route/design/plan/tdd/verify 加载 `harness-<stage>` forked skill。

## clarify

1. 并行探索：代码 `clarify.explore-code` → `code-explore`；文档 `clarify.research-docs` → `doc-research`。
2. 探索运行期间先问代码无关维度（T 目标、Scope、Constraint/risk）。**每轮只问最薄弱的一个维度**，调用 `AskUserQuestion` tool：

   ```yaml
   questions:
     - question: "【维度名】<问题>"
       header: "<≤4字标签>"
       options:
         - label: "<推荐选项> (Recommended)"
           description: "<一句理由>"
         - label: "<备选A>"
         - label: "<备选B>"
   ```

3. 探索 checker pass 后，再问代码相关维度：Data/SQL、Interface/API、Acceptance criteria。
4. 每轮回答后：`clarify.synthesize` → `clarify-synthesizer` 写 requirements + 七维评分；
   等 result.json → `clarify.synthesize` check → `clarify-reviewer`。
5. 全部七维 ≥ 4、无高风险歧义 → 展示评分 + 依据，请用户确认 scope。

七维：**T 目标 · Scope · User/actor · Data/SQL · Interface/API · Acceptance criteria · Constraint/risk**

## 隔离接力

executor 与 checker 必须是不同 subagent/run；checker 只消费 result artifact。worktree 只提供文件隔离；subagent 提供上下文隔离。

```bash
enterprise-harness handoff create <change-id> <stage> <behavior> execute   # 输出 HANDOFF_INPUT=<path>
enterprise-harness handoff create <change-id> <stage> <behavior> check <executor-run-id>
```

`<behavior>` 是 `stage.action` 格式（不是 agent 名）；写错时 pre-agent hook 打印正确命令。
完整映射 → `.claude/skills/harness/reference/behavior-map.md`

## 阶段决策

`enterprise-harness workflow status <change-id>` 读 `pendingDecision.options`；不在其中的决策失败。
完整表 → `.claude/skills/harness/reference/stage-decisions.md`

## 输出规则

只向用户输出：changeId · stage · currentGap · 本轮 evidence · checker verdict · **一个**下一动作或**一个**澄清问题。
不输出 ledger、schema、hook 全文。
