# Verify 制品合同

每个 executed TC 必须形成三层绑定：

```text
Plan task-commands.json
  → runtime verification-command-evidence (argv/outcome/time/output refs+digests)
  → canonical verification receipt (inputs + validation digest + evidence digest)
```

- command evidence 固定在 `evidence/verify/<verifyRunId>/<TC>.json`，stdout/stderr 为同目录固定命名日志。
- verification receipt 固定在 `evidence/verification/<verifyRunId>/<TC>.json`。
- 两者都绑定同一 verify handoff 的完整 inputDigests；任一输入变化即 stale。
- command evidence 的 executions 必须与 TC 映射 task 的末相冻结命令逐项一致，且 passing evidence 的
  所有 execution 必须 exit 0。
- `validation.md` 必须逐条展示 command evidence，不得自行发明 argv、exit code、时间或 digest。
- StageResult 必须同时包含 validation 和全部 canonical receipts，并由 finalizer 一次性持久化。
