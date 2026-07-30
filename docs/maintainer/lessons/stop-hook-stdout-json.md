---
id: stop-hook-stdout-json
severity: high
tags: [hooks, stop, json, protocol]
sourceChange: clarify-first-staged-orchestrator
recordedAt: 2026-07-21
---

# Stop hook 放行时 stdout 必须输出合法 JSON，否则报 JSON validation failed

## 症状

每次会话结束时 Claude Code 报 `Stop hook error: JSON validation failed`，
即使 hook 逻辑本身 exit 0、功能正常。

## 根因

Claude Code 的 Stop hook 契约：exit 0（放行）时，宿主会读取 stdout 并按
`{decision?, reason?, systemMessage?}` schema 校验。空 stdout 不是合法 JSON，
触发校验失败。我们的 stop.mjs 成功路径只用 `console.error`（stderr）打印
handoff guidance，stdout 为空 → 报错。

注意：Stop 的 `hookSpecificOutput` 不接受 `hookEventName` / `continue` /
`suppressOutput` 等字段，塞进去同样会被判非法。

## 规避

- Stop hook **放行**（exit 0）必须在 stdout 输出合法 JSON：`{}` 或
  `{"systemMessage":"..."}`。
- **阻断**用 `process.exit(2)` + stderr（exit 2 时 stdout 的 JSON 被忽略，
  stderr 会展示给用户）。
- 人类可读的 guidance 走 stderr，不要污染 stdout 的 JSON。
- 其它 hook（PreToolUse 等）exit 0 也走 stdout-JSON 协议时同理。

## 关联

- `harness/plugin/runtime/hooks/stop.mjs` 的 `allow()` 封装了 `{}` 输出
- `stop-handoff-smoke` 增加了“放行路径 stdout 必须是合法 JSON”的断言
