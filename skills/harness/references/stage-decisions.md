# v6 阶段推进合同

Load when: controller T is selected because Clarify runtime readiness reports route=transition with clarifyTransitionReady=true, or a post-Clarify stage reports stageTransitionReady.
Return to controller: after validating or attempting that single transition; re-read status before another action.

唯一 lifecycle：`clarify → design → plan → implement → verify → archive`。

| 当前阶段 | 允许推进的必要证据 |
|---|---|
| clarify | fresh canonical StageResult（含 required artifacts 与 digests）、不同 trusted identity/run 的 passing independent ReviewResult、完整且无 pending correction 的 TECPC；这些证据必须足以派生 candidate CompletionProof，但 persisted proof 不是输入前置条件 |
| design | schema-valid StageResult、全部 design assertions、独立 passing ReviewResult、TECPC 与 fresh input/output digest |
| plan | 冻结 tasks、strategy evidence 与独立 review |
| implement | task-level execution receipt、self-check 与独立 review |
| verify | fresh validation、final ReviewResult 与 completion TECPC |
| archive | verify evidence 仍 fresh 且归档前检查通过 |

主 Harness 只为真正的业务选择向用户提问。stage transition 不依赖 v5 state boolean projection；它读取结构化结果和 digest freshness。Clarify 只通过 lifecycle state command 推进；该命令原子写入 candidate CompletionProof、重新读取 canonical gate，再 CAS 更新 stage。`workflow status`、`workflow audit` 与旧 `confirm-scope` decision 均保持只读，不生成 proof 或推进 stage。
