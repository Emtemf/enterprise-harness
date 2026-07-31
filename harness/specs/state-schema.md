---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/templates/state.json
  - harness/schemas/state.schema.json
  - runtime/lib/state-migration.mjs
testRefs:
  - runtime/test/state-migration-backward-compat-smoke.mjs
  - runtime/test/state-store-concurrency-smoke.mjs
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

## 迁移

runtime 只支持显式、可测试、单向 migration。未知未来版本必须 BLOCK。

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
