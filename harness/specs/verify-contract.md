---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-09-06
implementationRefs:
  - skills/verify/SKILL.md
  - skills/verify/scripts/prepare-input.mjs
  - skills/verify/scripts/finalize-result.mjs
  - runtime/verify-run.mjs
  - runtime/lib/verify-command-evidence.mjs
  - runtime/lib/verification-receipts.mjs
testRefs:
  - runtime/test/verify-run-smoke.mjs
  - runtime/test/verification-receipt-contract-smoke.mjs
  - runtime/test/verify-skill-script-smoke.mjs
  - runtime/test/installed-verify-plugin-e2e.mjs
---

# Verify Contract

## 目标与边界

Verify 在所有 Implement TaskProof 已完成后重跑 Plan 冻结的验证命令，并把真实进程结果绑定到每个已接受
`TC*`。Verify worker 负责执行和报告，不修改产品代码、不重写 Plan、不自行批准完成；独立 reviewer 与
runtime CompletionProof 才拥有进入 Archive 的权限。

Verify Skill 使用 `context: fork` 与通用 `artifact-worker` 获得上下文隔离和受限工具面，同时以
`model: inherit` 尊重主会话/用户模型选择；`context: fork` 的 Skill 调用会等待隔离 worker 返回结果。`background`
是 custom subagent 字段，不写入 Skill frontmatter。

## 冻结输入

canonical `verify.collect` Handoff v2 必须 digest-bind：

- compound DesignProof 与 `test-cases.md`；
- PlanProof、`tasks.md` 与 `task-commands.json`；
- ImplementProof 以及 Main 选择纳入的 task receipts/reviews/risk evidence。

Runtime 在执行前和持久化前重新计算全部 input digest。`state.json` 用于检查当前 stage/lifecycle，但不作为
跨 transition 的不可变输入，避免进入 Archive 后把已完成 Verify proof 自行变 stale。

## 命令解析与执行

accepted TC 必须由至少一个 Plan task 映射。`verify-run <changeId> <verifyRunId> <TC>` 对每个映射 task
读取 `task-commands.json` 中的末相命令，保持 task 顺序并使用 argv 数组、`shell: false` 执行。调用方不能
传 child argv，Verify worker 也不能直接运行或改写命令。

Runner 只接受 active Verify state、fresh handoff 和与该 run 绑定的 active `artifact-worker/verify`。每条
execution 必须记录 task、phase、literal argv、outcome、exit code/signal/spawn error、开始/结束时间、
stdout/stderr ref 与 digest。全部 execution exit 0 才能得到 passing command evidence。

## 三层证据

```text
task-commands.json
  → evidence/verify/<verifyRunId>/<TC>.json
  → evidence/verification/<verifyRunId>/<TC>.json
```

第一层是 Plan 冻结意图；第二层是 runner 生成的真实进程证据；第三层把该证据、完整 handoff inputs 与
当前 `validation.md` digest 绑定成 canonical TC receipt。executed TC 只能引用同 change/run/TC 的
command evidence，不能引用任意日志或 Implement task receipt。证据与 receipt 均不可覆盖。

`unsupported` 永远阻断；critical E2E 必须 executed。普通 skipped 必须保留明确原因，并由独立完成审查
判断是否满足已冻结验收范围。waiver 在可信授权制品落地前 fail closed。

## StageResult 与完成审查

Verify finalizer 校验输入、DesignProof、validation 结构、逐 TC machine evidence 与 receipts，然后通过
公开 runtime API 一次性持久化 StageResult。Main 随后创建不同 run/agent 的 review；reviewer 只读
validation、StageResult、command evidence、receipts 与风险 evidence，不读取 executor 对话。

只有 fresh StageResult、passing self-check、独立 ReviewResult、TECPC 和全部 canonical TC receipts 同时
成立时，runtime 才生成 Verify CompletionProof 并允许进入 Archive。聊天中的“测试通过”不是证据。

## E2E 工具选择

Test Design 定义关键用户流程与可观察断言，Plan 冻结适用项目的实际命令。Playwright CLI、浏览器 MCP、
Chrome DevTools、HTTP/CLI driver 都只是命令实现手段；Verify 不根据临时偏好换工具，也不以单测替换已冻结
E2E。工具缺失时保留 command evidence 与 blocker，回到最早可修复的 Plan/环境 gate。
