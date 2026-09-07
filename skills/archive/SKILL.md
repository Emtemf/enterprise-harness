---
name: archive
description: >
  在 Verify CompletionProof 通过后封存需求到验证的完整摘要链，生成 runtime attestation 并交给独立归档审查。
argument-hint: HANDOFF_INPUT=<canonical-input.json-path>
user-invocable: false
context: fork
agent: enterprise-harness:artifact-worker
model: inherit
---

# Archive

本 Skill 在隔离上下文中执行归档前封口，不制造验证结论、不修改产品代码，也不物理移动 change。它只消费
canonical handoff 中摘要绑定的长期制品和 CompletionProof，由 runtime 生成 immutable manifest/attestation
并原子持久化 Archive StageResult。聊天中的“完成”、手写 manifest 或缺失 lineage 都不能进入归档审查。

本次唯一 handoff：

```text
$ARGUMENTS
```

## 必须执行的流程

固定顺序：marker prepare → frozen lineage review → runtime manifest/attestation → self-check → finalizer → Main independent review → runtime archive-finalize。

1. `$ARGUMENTS` 必须且只能是 Main 传入的 canonical marker。运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/prepare-input.mjs" "HANDOFF_INPUT=<canonical-input.json-path>"
   ```

   这是独立命令，不追加管道、`head` 或文件重定向；仅允许诊断用 `2>&1`。prepare 必须验证 exact
   `archive` execute handoff、active Archive state、fresh validation、全部 required lineage 及 input digest。
   prepare 退出 0 就表示该 canonical script 已获准且输入门禁通过；不得因随后无关的 Bash 诊断被 hook 拒绝，
   反推 prepare/finalizer 不可执行。
2. 始终读取 `references/method.md`、`references/artifact-contract.md` 和 `references/self-check.md`。只从
   frozen refs 检查 `requirements → design → test-cases → tasks/commands → ImplementProof → validation/VerifyProof`，
   同时保留 classification、技术债、项目长期契约和 Clarify decision snapshot；不得从聊天补写缺口。
   制品和 reference 一律使用 `Read`，禁止用 Bash `cat`/`ls`/`find` 探查目录、模板或 schema；prepare 输出已经给出
   exact `changeId`、`runId`、`inputRefs`、`inputDigests` 和 `outputRefs`。
3. 运行：

   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <archive-run-id>
   ```

   prepare 成功且 self-check 无真实 blocker 时必须运行 finalizer，不能继续寻找另一套输出模板，也不能手工拼装、
   在聊天中伪造或自行降级 StageResult。finalizer 会重新验证 state/input freshness，通过 runtime API 创建唯一
   manifest/attestation，并一次性持久化 StageResult。成功后立即停止，只返回 durable result、manifest、attestation 和下一动作；不得再调用
   `handoff persist`，不得运行 `archive-finalize`。
4. Main 必须创建不同 run/agent 的 `review` check handoff，使用 archive rubric 独立检查完整性、lineage、目标冲突、
   stale/unsupported/waiver 和恢复边界。worker self-check 不能代替独立 ReviewResult。
5. 只有 runtime 生成 fresh Archive CompletionProof 后，Main 才运行：

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" lifecycle archive-finalize <change-id>
   ```

   物理移动、lifecycle CAS、失败回滚、session/compat pointer 清理都属于 runtime；Archive worker 不执行。

## 行为边界

- 不编辑 `state.json`、CompletionProof、manifest、attestation、历史 SQL、产品代码或既有归档。
- manifest 必须显式列出全部 frozen lineage；间接提及、目录级引用和聊天摘要不算绑定。
- stale、missing、block、unsupported 和任何非空 waiver 一律阻断；未完成 change 走有原因的 `abandon`。
- 归档目标存在、测试仍引用 change、移动失败或指针残留时停止并保留 runtime 恢复提示。
- 本轮只封存已有负知识/决策制品，不自动生成 lessons，不实现 RAG、PDR 反推或学习闭环。

## Supporting files

- `references/method.md` — 归档封口、独立审查和物理移动顺序。
- `references/artifact-contract.md` — lineage、manifest、attestation、StageResult 与 ArchiveProof 合同。
- `references/self-check.md` — worker 提交前检查清单。
- `references/examples.md` — 有效/无效标准样例。
- `scripts/prepare-input.mjs` / `scripts/finalize-result.mjs` — marker 校验与一次性结果持久化。
- `evals/evals.json` — invocation、伪证据、stale、并发和 finalization 行为回归。

完成前读取 `${CLAUDE_PLUGIN_ROOT}/skills/harness/references/downstream-pitfalls.md` 的 Archive 行；
命中部分发布、历史覆盖、活动指针残留或 post-archive 修改风险时必须停止并返回最早恢复动作。
