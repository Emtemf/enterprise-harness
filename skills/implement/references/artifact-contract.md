# Implement 产物合同

本 Skill 不手写执行证据。唯一执行事实是 `task-run` 生成的 canonical receipt：

```text
harness/changes/<changeId>/evidence/tasks/<taskId>.json
```

receipt 必须绑定 `runtime-runner` provenance、implementer agent identity、隔离 worktree 与 git common dir、
冻结 input digests、strategy phase chain、exact argv、真实 exit code、stdout/stderr digest、执行时间、
HEAD/tree 快照和 baseline-relative changed paths。TDD 的 RED 必须非零，GREEN/REFACTOR 必须为零；
spawn error、signal、skip 与 unsupported 均不能解释为通过。

`finalize-result.mjs` 重验该 receipt 及同 run 的 common-dir spool，然后原子写入 Handoff v2
`StageResult`。StageResult 只引用 canonical receipt，不复制代码 diff 或伪造额外证据。stdout 只是已持久化
结果的回显，不是第二个提交接口。

独立 reviewer 消费 frozen task/design/test-case 输入、StageResult、canonical receipt，以及 receipt 指向的
worktree/changed paths；reviewer 不读取 implementer transcript，不修改 candidate，也不能与 implementer
复用 agent identity。runtime 只有在所有 task 的 execute/check chain fresh 且独立时，才把每个 task 汇入
Implement CompletionProof 的 `taskProofs`。
