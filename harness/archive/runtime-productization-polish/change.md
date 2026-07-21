# Change

## 原始需求

对应 issue #10：`[Runtime productization] Improve installer, adapter schema, and cross-platform verification`。

在 #13 已收口 local adapter diagnostics、且当前仓库已有 fresh source-external release smoke 证据的基础上，本轮继续把剩余 runtime productization 主线收成更接近产品化的交付面，当前聚焦：

- package-relative / external-cwd launcher 行为
- help / usage / exit-code / side-effect hygiene
- verify contract 与 runtime readiness 分离
- upstream-check 对 validated version 的真实比较

## 业务结果

让 runtime/productization 的声明不再只依赖：
- happy path 命令可运行
- 单次 source-external smoke
- 手工阅读 README

而是补成：
- external-cwd / launcher / help side-effect contract
- clearer runtime readiness vs contract verification boundary
- upstream validated version mismatch 可见
- 更可重复的 runtime release/readiness evidence

## 非目标

- 不重写整个 runtime layer
- 不把 Java golden sample / API 语义工作混入本 issue
- 不在本轮扩展新的宿主平台
- 不在本轮引入完整 package manager/distribution 生态支持

## 归属服务 / 模块 / 业务域

- scope: portable runtime / runtime productization
- owning module: `harness/plugin/runtime/` + `.github/workflows/`
- business domain: installer / launcher / readiness / verification separation / runtime release profile

## 初步路由

- request shape: modify
- candidate tier: L3
- hard signals: platform_rule_change, runtime_entry_change, release_profile_change
- reason: 会改变 launcher、help side effects、verify meaning、runtime release/readiness contract 与 CI/runtime productization 行为，已经超出单一子模块 happy-path 调整

## 最小探索证据

- `release-local.mjs` 已修正为基于 `git archive HEAD` 的 source-external smoke，并成功通过 fresh smoke
- `context7.mjs` / child process shell 边界仍需专门关注 Windows 参数安全与多词 query 行为
- `verify.mjs` 当前仍把 contract / runtime checks 混成一个绿灯口径
- `upstream-check.mjs` 仍只展示 expected version，不把 mismatch 作为明确结果
- issue #10 的 audit comments 已明确指出：launcher external-cwd、Windows argv 边界、help 无副作用、readiness separation、validated version comparison 仍未闭环

## 最终路由

- final tier: L3
- owning scope: `runtime productization / launcher / readiness / verification / cross-platform contract`
- next focus: 先形成 durable design / tasks，再按 TDD 收口 launcher/help/readiness/upstream-check 四块主线

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- 本轮不拆新命令：继续保留 `node harness/plugin/runtime/cli.mjs verify` 作为统一入口，但输出中显式区分 `contractChecks` 与 `runtimeReadinessChecks`
- `context7` Windows 行为本轮直接收口在 `context7.mjs` + launcher smoke，不新引入更上层 child-process wrapper
- `upstream-check` 的 validated version mismatch 本轮采用 fail/warn matrix：运行型上游（`kind=runtime-upstream`）只要命令不可执行即 hard fail；命令可执行但 `currentVersion !== expectedVersion` 时 `ok=false`、`status=validated-version-mismatch`、退出码 1；参考型上游继续 `expectedVersion=manual-review` 且不因版本字符串本身失败

## 假设

- #13 已完成；当前仓库也已有可复用的 fresh source-external release smoke 证据，因此 #10 可以专注更大的 runtime productization 骨架，而不把 #15 的完成态当成本 change 的 machine-readable 前提
- 当前 issue 不需要新建独立 package/distribution channel，即可先完成 launcher/readiness/help/verification separation

## Waiver

暂无。

## Requirement Review

该需求属于 runtime productization 主线，会改变 launcher、readiness、verification 和 release profile 的对外行为表达，按 L3 路由合理。
