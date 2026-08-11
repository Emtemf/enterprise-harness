---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-11
implementationRefs:
  - harness/templates/state.json
  - harness/schemas/state.schema.json
  - runtime/lib/state-migration.mjs
  - runtime/lib/state-v5.mjs
  - runtime/lib/sessions.mjs
  - runtime/lib/change-locks.mjs
  - runtime/lib/project-profile.mjs
testRefs:
  - runtime/test/state-migration-backward-compat-smoke.mjs
  - runtime/test/state-v5-boundary-smoke.mjs
  - runtime/test/session-concurrency-v5-smoke.mjs
  - runtime/test/stale-change-lock-v5-smoke.mjs
  - runtime/test/project-profile-v5-smoke.mjs
---

# State Schema Contract

机器可读真相层是 `harness/schemas/state.schema.json`；本文件说明迁移和并发语义。

`state.json` 必须包含：

- `schemaVersion`
- `revision`
- `changeId`
- `tier`
- `state`
- `currentTask`
- `workflow`
- `impact`
- `gates`
- `approvals`
- `validation`
- `blockers`

## State v5

0.4 的 active change 使用 `schemaVersion: 5`。v5 额外定义：

- `status` / `lifecycle`：机械生命周期（`active`、`archived`、`abandoned`）
- `controller`：当前治理 controller 的来源和 revision
- `sessionBinding`：当前 session 的 change/worktree 绑定，运行态副本位于 git common dir
- `changeLock`：change writer 的锁持有信息
- `artifacts`：artifact 路径与 digest 的机械索引
- `dependencies`：artifact dependency graph
- `blocker`：当前阻断原因；详细证据仍在 runs/evidence

高阶的 ready/approved/stale 结论不能新增为第二份真相；应由 artifact digest、evidence 和独立 checker 推导。`state.json` 里的旧 workflow 字段在迁移窗口内只作为兼容投影，不能绕过 v5 gate。

active v4 不自动迁移到 v5，也不能通过 last-write-wins 直接覆盖。它必须经过显式转换或阻断；`harness/archive/**` 中的旧 v4 只读，可由 archive adapter 读取但不批量重写。

## 并发运行态

`<git-common-dir>/enterprise-harness/sessions/` 保存 session binding，`locks/` 保存 change lock，`ledger/` 保存跨 worktree 运行证据。worktree 内的 change 目录不是 session binding 的权威来源。

项目路径和构建边界由 `harness/project.json` 的 profile v1 提供；缺失时使用 Java/Maven 默认 profile，格式错误则返回 `EH-PROJECT-PROFILE-001`。

change lock 默认只允许持有者释放；锁记录超过显式 stale threshold 后，只有确认 owner session 已解绑并提供 lock token 的运行态恢复命令才能清理 stale lock。恢复不会修改 change evidence，也不是通用 `--force` 绕过。

## Durable 与 volatile

Durable：用户决定、阶段、task、review projection、validation digest。

Volatile：显示卡、建议入口、运行时探测结果；不得进入 completion digest。

## 并发

写入目标采用临时文件加 rename。状态更新必须比较 expected revision；event 使用唯一 eventId 并幂等去重。无法获得一致 revision 时 BLOCK，不做 last-write-wins。

`state.json` 只投影 evidence，不能用手工字段自证 gate。

## Workflow 阶段标志

`workflow` 的阶段就绪标志各自独立，不得相互替代：

- `clarifyReady`：七维评分达标
- `userConfirmedScope`：用户确认执行范围
- `routeReady`：用户确认 tier 与影响面；design 的前置
- `planReady`：task 与 exact argv 已冻结
- `tddStatus`：真实 RED/GREEN/REFACTOR 进度

design 要求 `clarifyReady`、`userConfirmedScope` 和 `routeReady` 同时为 true。缺任一项时 stage 回落到对应阶段，不得跳过。
