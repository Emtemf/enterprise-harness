# v6 阶段推进合同

唯一 lifecycle：`clarify → design → plan → implement → verify → archive`。

| 当前阶段 | 允许推进的必要证据 |
|---|---|
| clarify | 已确认 requirements、classification、ResearchPacket（适用时）以及新鲜独立 review |
| design | schema-valid StageResult、全部 design assertions、独立 passing ReviewResult、TECPC 与 fresh input/output digest |
| plan | 冻结 tasks、strategy evidence 与独立 review |
| implement | task-level execution receipt、self-check 与独立 review |
| verify | fresh validation、final ReviewResult 与 completion TECPC |
| archive | verify evidence 仍 fresh 且归档前检查通过 |

主 Harness 只为真正的业务选择向用户提问。stage transition 不依赖 v5 state boolean projection；它读取结构化结果和 digest freshness。
