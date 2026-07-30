---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-07-29
implementationRefs:
  - harness/templates/state.json
  - harness/schemas/state.schema.json
  - harness/plugin/runtime/lib/state-migration.mjs
testRefs:
  - harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs
  - harness/plugin/runtime/test/state-store-concurrency-smoke.mjs
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
