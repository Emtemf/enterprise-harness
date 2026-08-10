---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-10
implementationRefs:
  - harness/plugin/hooks-manifest.json
  - runtime/hooks
  - runtime/lib/hooks
  - runtime/lib/hook-input.mjs
testRefs:
  - runtime/test/hook-manifest-parity-smoke.mjs
  - runtime/test/hook-snapshot-attribution-smoke.mjs
  - runtime/test/hook-dedup-guard-smoke.mjs
---

# Hooks Contract

权威 hook 表在 `harness/plugin/hooks-manifest.json`。每项定义 event、matcher、script、timeout、performance budget 和 fail mode。

## 分层原则

hook 文件必须是**薄壳**：读 stdin → 委托 `runtime/lib/hooks/*.mjs` 的策略函数 → 输出 `{ exitCode, stdout?, stderr? }` → exit。
stdin 解析和结果输出统一走 `runtime/lib/hook-input.mjs`（唯一契约点）。逻辑全部在 lib，可单测、好定位。

| Hook 类别 | 输入 | 输出 | 默认 fail mode |
|---|---|---|---|
| pre-explore | tool event | allow/block + CodeGraph attempt | closed |
| pre-write | tool event + before snapshot | allow/block | closed |
| post-write | tool event + after snapshot | stale/violation | closed |
| agent lifecycle | Agent/Subagent events | ledger + result | closed |
| session/stop | durable state | status/recovery | session open; stop closed |

## 静态阶段链 vs 动态瞬间 gate

写受治理路径（`src/main/java`、`src/test/java`、`openapi`）需要两类前置，职责分离：

### 静态阶段链（ambiguity/router/design/plan 完整性）

- 只依赖已批准的 clarify/route/design/plan 证据，写代码过程中不变化。
- 由 `enterprise-harness validate <change-id>` 在**阶段边界**（plan freeze 后、tdd 开始前）
  显式验证，通过后落 `evidence/stage-gate.json` marker（含 changeDigest，只覆盖
  requirements/change/design/tasks + reviews/*）。
- pre-write **不重算**阶段链；只轻查 marker 存在且 digest 匹配当前静态证据。
  marker 缺失/过期 → block，提示先运行 `validate`。
- marker digest 刻意排除 state.json 动态字段（currentTask/redVerified）与 evidence/tdd receipts，
  所以 tdd 中途写证据不会误使 marker 失效。

### 动态瞬间 gate（每次写都必须当场查）

- agent 绑定 `enterprise-harness:tdd-executor`
- 写生产代码需当前 task 的真实 RED receipt
- 写测试需归属某个 currentTask

## 探索豁免

探索豁免按每个解析路径判断；Bash 中出现一个 README token 不能豁免同命令的业务代码路径。无法解析的 fallback 探索 fail-closed。

Bash 写入通过相同 toolUseId 的前后 snapshot 归因，覆盖 unstaged、staged、untracked、deleted、renamed 和 generated files。

关键异常必须使用稳定错误码写 violation ledger，不允许空 `catch {}`。
