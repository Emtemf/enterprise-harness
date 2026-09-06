---
name: verify
description: >
  在所有 Implement TaskProof 已封口后执行 Plan 冻结命令，生成逐测试用例机器回执与 validation.md。
argument-hint: HANDOFF_INPUT=<canonical-input.json-path>
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
model: inherit
---

# Verify

本 Skill 在隔离上下文中完成最终验证执行，不修改产品代码，不自行批准完成。它把已接受的 `TC*`、
Plan 冻结 argv、ImplementProof 与真实命令结果汇聚成逐用例机器证据、`validation.md` 和一次性持久化的
Verify StageResult。聊天结论、手写日志和 Implement task receipt 都不能替代 Verify runner 的新鲜执行证据。

本次唯一 handoff：

```text
$ARGUMENTS
```

## 必须执行的流程

固定顺序是：marker prepare → frozen inputs only → 逐 TC runner → validation 模板 → self-check → finalizer → Main independent review。

1. `$ARGUMENTS` 必须且只能是 Main 传入的原样 canonical marker。运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/prepare-input.mjs" "HANDOFF_INPUT=<canonical-input.json-path>"
   ```

   这是独立命令，不追加管道、`head` 或文件重定向；仅允许为诊断追加 `2>&1`。prepare 必须校验 exact
   `verify.collect` handoff、Verify state、DesignProof、PlanProof、ImplementProof、`test-cases.md`、`tasks.md`、
   `task-commands.json` 及全部 digest。失败时原样返回稳定错误码和恢复动作，不猜测输入。
2. 始终读取 `references/method.md`、`references/artifact-contract.md` 和 `references/self-check.md`。只从
   frozen `test-cases.md` 读取 accepted `TC*`；只从 `task-commands.json` 获取由 Plan 冻结且映射到该 TC 的
   task 末相命令，不自行改写、补充或通过 shell 拼接 argv。
3. 对每个需要执行的 accepted `TC*`，分别运行一条独立命令：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" verify-run <change-id> <verify-run-id> <TC-id>
   ```

   不得传入 `--` 或 child argv。runner 会在 `harness/changes/<changeId>/evidence/verify/<runId>/` 写入
   immutable command evidence 与 stdout/stderr logs。任一命令 block 立即停止 passing finalization，并把
   evidence ref 返回 Main；不得手写、复制或修改这些 runtime-owned 文件。
4. 使用 `assets/validation.md.tmpl` 生成 `validation.md`。Commands 表逐条转录机器证据中的 frozen/actual
   argv、exit status、timestamps 与 output digest；Results 同时汇总 task receipts、独立 reviews、
   Design/Plan/Implement proofs 和适用 rubric。每个 accepted TC 恰有一行：

   ```text
   - TCn | executed | harness/changes/<changeId>/evidence/verify/<runId>/TCn.json
   ```

   只有未执行用例才可写 `skipped`/`unsupported`，并附明确原因；`unsupported` 阻断，critical E2E 必须
   `executed`。waiver 在可信授权制品落地前一律阻断。
5. 按 `references/self-check.md` 检查 argv 忠实度、输入 freshness、TC 覆盖、可观察断言、例外和 TECPC。
   缺少真实业务选择时只返回一个紧凑 `NEEDS_DECISION`；只有主 Harness 可以向用户提问。
6. 运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <verify-run-id>
   ```

   finalizer 会重新校验机器证据、逐 TC receipt、fresh inputs 和 validation 形状，并通过公开 runtime API
   原子持久化 StageResult。成功后立即停止，只把 StageResult 路径、validation 路径与下一动作返回 Main。
   Main 必须派遣不同 run/agent 的 independent review；只有 runtime CompletionProof 可进入 Archive。

## 行为边界

- 不修改产品代码、测试代码、冻结 Plan、state、proof、runner evidence 或 receipt。
- 不用 task receipt 代替 Verify 的重跑证据；task receipt 只作为上游实现证据汇总。
- 不因单测通过而省略 applicable integration/E2E；浏览器工具由已冻结用例与命令决定，而不是临时偏好。
- 不把 skip、unsupported、stale、waiver 或 worker self-check 提升为最终 pass。
- 不输出隐藏推理，只输出公开可审计的证据、阻断原因和恢复动作。

## Supporting files

- `assets/validation.md.tmpl` — 唯一 `validation.md` 输出骨架。
- `references/method.md` — 用例执行、证据汇聚和 E2E 方法。
- `references/artifact-contract.md` — command evidence、TC receipt 与 StageResult 合同。
- `references/self-check.md` — Verify worker 提交前检查清单。
- `references/examples.md` — 有效/无效标准样例。
- `assert/validation-shape.mjs` — validation 结构和机器证据引用校验。
- `scripts/prepare-input.mjs` / `scripts/finalize-result.mjs` — 冻结输入准备与一次性结果持久化。
- `evals/evals.json` — invocation、执行、伪证据、失败与 finalization 行为回归。

完成前读取 `${CLAUDE_PLUGIN_ROOT}/skills/harness/references/downstream-pitfalls.md` 的 Verify / E2E 行；
适用的端到端流程没有可观察机器证据时不得生成 passing StageResult。
