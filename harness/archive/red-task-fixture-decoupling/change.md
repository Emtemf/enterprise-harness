# Change

## 原始需求

在 `smoke-fixture-decoupling` 修复并归档后，`PROGRESS.md` 仍记录一条同类技术债：
`harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs` 硬编码引用真实业务 change
`gate-hardening-semantics`（第 68/70 行），这会让该已 `VALIDATED` 的 change 同样无法通过 `lifecycle archive`
（被 `isReferencedByTests` 字符串扫描拦截）。用户要求继续沿着这条技术债线收口。

## 业务结果

`gate-hardening-red-task-smoke.mjs` 不再依赖任何真实业务 change 的目录名或状态：复制整仓到临时目录后，先清空
该副本 `harness/changes/` 下的全部真实条目，再只注入该测试自己需要的合成 fixture change，完成
`pre-write.mjs` 的 RED 门禁回归验证。修复后 `gate-hardening-semantics` 上的 `isReferencedByTests` 拦截解除，
可以正常归档。

## 非目标

- 不改变该测试验证的 gate 语义本身（仍然断言生产/OpenAPI 写入需要 currentTask-scoped red verification）
- 不修改 `pre-write.mjs`/`gates.mjs` 等生产 runtime 代码
- 不扩展到其他测试文件（本轮只处理 `gate-hardening-red-task-smoke.mjs` 这一处剩余硬编码）

## 归属服务 / 模块 / 业务域

- scope: harness runtime test 自身的 fixture 隔离
- owning module: `harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`
- business domain: 测试基础设施 / runtime governance 自检

## 初步路由

- request shape: modify
- candidate tier: L1
- hard signals: 无（单文件测试夹具修复，不影响 API/data/architecture/rule）
- reason: 与 `smoke-fixture-decoupling` 同类，但影响面更小，仅 1 个文件

## 最小探索证据

- `grep -rln "gate-hardening-semantics" harness/plugin/runtime/test/*.mjs` 仅命中
  `gate-hardening-red-task-smoke.mjs`
- 该文件 `copyDir(repoRoot, repoCopy)` 整仓复制后，直接把 `harness/ACTIVE_CHANGE` 写成
  `gate-hardening-semantics`，并读取/改写 `harness/changes/gate-hardening-semantics/state.json`
- 该文件不调用 `cli.mjs verify` 做全量扫描，只 `spawnSync` `pre-write.mjs` 针对单一目标文件路径验证 RED 门禁；
  因此不需要像 `smoke-fixture-decoupling` 那样扩大到 4 个文件，结构性修复范围就是这 1 个文件

## 最终路由

- final tier: L1
- owning scope: `harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`
- next focus: 设计阶段明确如何在清空 `harness/changes/` 后补齐最小 fixture，使 `pre-write.mjs` 仍能被该测试正确驱动

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: no

## 需要确认的决策

- 已确认采用**结构性修复**：清空临时副本 `harness/changes/`，只注入本测试自己需要的合成 fixture

## 假设

- 该测试当前依赖的 `fixtures/red-task-missing-proof/state.json` 可直接复用于新的合成 fixture，不依赖真实
  `gate-hardening-semantics` change 目录里的其他文件

## Waiver

不适用。

## Requirement Review

待 reviewer 消费。
