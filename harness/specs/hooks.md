---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/plugin/hooks-manifest.json
  - harness/plugin/runtime/hooks
testRefs:
  - harness/plugin/runtime/test/hook-manifest-parity-smoke.mjs
  - harness/plugin/runtime/test/hook-snapshot-attribution-smoke.mjs
---

# Hooks Contract

权威 hook 表在 `harness/plugin/hooks-manifest.json`。每项定义 event、matcher、script、timeout、performance budget 和 fail mode。

| Hook 类别 | 输入 | 输出 | 默认 fail mode |
|---|---|---|---|
| pre-explore | tool event | allow/block + CodeGraph attempt | closed |
| pre-write | tool event + before snapshot | allow/block | closed |
| post-write | tool event + after snapshot | stale/violation/block | closed |
| agent lifecycle | Agent/Subagent events | ledger + result | closed |
| session/stop | durable state | status/recovery | session open; stop closed |

探索豁免按每个解析路径判断；Bash 中出现一个 README token 不能豁免同命令的业务代码路径。无法解析的 fallback 探索 fail-closed。

Bash 写入通过相同 toolUseId 的前后 snapshot 归因，覆盖 unstaged、staged、untracked、deleted、renamed 和 generated files。

关键异常必须使用稳定错误码写 violation ledger，不允许空 `catch {}`。
