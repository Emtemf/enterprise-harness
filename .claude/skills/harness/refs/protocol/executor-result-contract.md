# HANDOFF_RESULT 输出合同

最后必须输出以下定界块；JSON 可以多行，但定界符必须独占一行：

```text
ENTERPRISE_HARNESS_HANDOFF_RESULT
{
  "handoffVersion": 1,
  "runId": "<与 input 完全相同>",
  "changeId": "<与 input 完全相同>",
  "stage": "<与 input 完全相同>",
  "behavior": "<与 input 完全相同>",
  "role": "execute",
  "agent": {
    "type": "<与 input 完全相同>",
    "skill": "harness"
  },
  "tecpc": {
    "target": "本行为目标和成功条件",
    "evidence": ["真实命令、artifact、digest、reviewable facts"],
    "context": ["实际消费的最小输入引用和未决不确定性"],
    "path": "执行路径、为什么采用它、下一步交给谁",
    "correction": "失败码、恢复动作、不得掩盖的 blocker"
  },
  "outputRefs": ["harness/changes/<change-id>/...（实际写入路径）"],
  "blockers": [],
  "summary": "给主 orchestrator 的压缩结论"
}
END_ENTERPRISE_HARNESS_HANDOFF_RESULT
```

**关键约束**：
- `runId`、`changeId`、`stage`、`behavior`、`role`、`agent` 六个字段必须与 `input.json` 完全相同，不得修改
- `outputRefs` 只列实际写入的文件路径，不列计划中未写的
- `blockers` 为空时必须设为 `[]`，不得省略
- 缺少必要输入时返回此 envelope 并在 `blockers` 中说明，不得猜测补齐
