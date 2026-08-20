---
id: hook-dedup-needs-event-identity
severity: high
tags: [hooks, dedup, plugin, settings, concurrency]
sourceChange: hook-dedup-session-events
recordedAt: 2026-08-03
---

# 重复注册的 hook 只能靠事件身份去重，`CLAUDE_PLUGIN_ROOT` 守卫和 rename 抢占都是假的

## 症状

在本仓库开发时（既装了 enterprise-harness 插件，`.claude/settings.json` 又注册了同一批
hook），每个事件被触发两遍：SessionStart banner 打两遍，Stop 门禁跑两遍。

## 根因

三层，逐层都比看上去更隐蔽。

**1. `test -z "$CLAUDE_PLUGIN_ROOT"` 守卫恒真。**
`CLAUDE_PLUGIN_ROOT` 由宿主**按插件**注入到该插件自己的 hook 进程里。settings.json 的
hook 不属于任何插件，这个变量在它的执行环境里**永远是空**，所以守卫永远放行。它想拦的
「settings hook 在插件环境下被调用」这个场景根本不存在。

**2. 原有 `dedupGuard` 只覆盖有 `tool_use_id` 的事件。**
SessionStart / Stop 没有 `tool_use_id`，`if (!toolUseId) return false` 直接放行。

**3. `writeFileSync(tmp, {flag:'wx'})` + `renameSync` 不是原子抢占。**
tmp 文件名带 pid，所以 `wx` 对每个进程都成功；而 `rename` 会**覆盖**已存在的目标。
结果是每个并发进程都认为自己抢到了。实测 8 进程并发有 4~8 个同时「获胜」。
必须直接对 marker 本身 `open(marker, 'wx')` —— O_EXCL 才是那把锁。

## 规避

- 重复注册的去重必须做在 **hook 脚本内部**，键取「两个通道都能观察到的同一事件身份」：
  - 有 `tool_use_id` 的事件 → 用它。
  - SessionStart → **不能**只用 `session_id`：它在 resume / clear / compact 时会用同一个
    `session_id` 再次触发，只用 id 会让第一次 startup 之后的整个会话都拿不到 harness
    上下文。用 `session_id + source + transcript 的 size/mtime`。
  - Stop（**每轮**一次）→ 不能只用 `session_id`，否则第一次 stop 之后整个会话的门禁
    都被静音。用 `session_id + transcript 的 size/mtime` 钉住单次 stop。
  - 通用判据：**先问这个事件在一次会话里会不会重复触发**。SessionStart 和 Stop 都栽在
    「每会话一次」的错误假设上，而且是分两次栽的。
- 拿不到身份时**必须 fail open**：漏打一次 banner 是小事，静音掉 Stop 门禁会让未验证的
  change 直接结束会话。
- 抢占用 `fs.openSync(marker, 'wx')`，不要 tmp+rename。
- Stop 的重复调用仍要输出 `{}`（见 [stop-hook-stdout-json](./stop-hook-stdout-json.md)），
  只跳过门禁和 guidance，不能跳过 stdout 契约。
- agent lifecycle hooks（pre/post-agent、subagent-start/stop、task-completed）**不加**
  marker 守卫：ledger 是 append-only 且消费者按 agentId 取最新事件，重复触发的**结果**
  已经幂等；加守卫反而可能跳过链条里真实的一环。

## 关联

- `runtime/lib/hook-dedup.mjs`：`dedupGuard` / `sessionDedupGuard` /
  `sessionStartEventIdentity` / `stopEventIdentity`
- `runtime/test/sessionwide-hook-dedup-smoke.mjs`：并发抢占回归（用 stdin 屏障对齐
  8 个进程的抢占窗口，否则 node 启动开销会把竞态藏起来）；这个烟雾测试证明了
  plugin cache 与 project-local 两条通道最终必须落到同一个 marker 空间。
- `CLAUDE_PROJECT_DIR` 不是“可选优化”，而是 settings hook 与 plugin hook 统一标记的
 共同锚点；少了它，SessionStart/Stop 就会重新分叉出重复 banner / guidance。

