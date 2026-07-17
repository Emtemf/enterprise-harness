# Change

## 原始需求

对应 issue #13：`[Runtime productization] Tighten local adapter schema and installer diagnostics`。

当前目标是在不扩大到完整 distribution / release productization 的前提下，把 local adapter contract 和 install/doctor/sync 的诊断面收紧成更像产品的 first-run / migration path。

## 业务结果

让 portable runtime 的本机接入不再只依赖：
- example JSON
- 宽松存在性检查
- 模糊 warning

而是补成：
- 更明确的 local adapter 字段语义
- 更清楚的 required / optional 诊断
- install/setup/doctor/sync 对缺字段 / 旧格式 / 缺工具的更明确引导

## 非目标

- 本轮不扩展 Java golden sample 工作
- 本轮不做 release-local / source-external smoke
- 本轮不重写整个 runtime layer
- 本轮不引入新的发布/打包机制

## 归属服务 / 模块 / 业务域

- scope: portable runtime / local adapter
- owning module: `harness/plugin/runtime/`
- business domain: machine-local adapter contract / installer diagnostics

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: runtime_contract_change, local_config_change, diagnostics_change
- reason: 会改变本机 adapter schema 校验与 install/doctor/sync 行为，但主要限定在 runtime 子系统内，不是全仓平台规则改造

## 最小探索证据

- `lib/local-adapter.mjs` 当前只校验 `schemaVersion/runtimeVersion/nodeCommand/codegraphCommand/context7.mode/context7.apiKeyEnvVar/mcp.projectConfig/mcp.requiresLocalApproval`
- `local-adapter.example.json` 目前只有最小 happy-path 样例，没有更强字段语义或 migration 提示
- `setup-local-adapter.mjs` 只做模板复制/浅合并，不报告字段缺口
- `doctor.mjs` / `sync.mjs` 对 adapter 的反馈主要是“文件不存在”或拼接后的 error string，还不够 product-like

## 最终路由

- final tier: L2
- owning scope: `runtime adapter schema + diagnostics tightening`
- next focus: 先做 durable design / tasks，再按 TDD 收紧 adapter schema 与 installer diagnostics

## 影响矩阵

- API: no
- data: no
- architecture: yes
- rule: yes

## 需要确认的决策

- local adapter schema 是否继续保留 `schemaVersion = 1`，还是引入 migration/compat 字段
- 缺失字段是统一 warning，还是区分 hard fail / soft warn
- `doctor` / `sync` / `setup-local-adapter` 分别承担哪些诊断职责，避免重复或冲突

## 假设

- issue #13 是 #10 的窄子集，当前先收口 local adapter schema 与 diagnostics，而不扩到完整 installer/productization
- 本轮仍使用 `local-adapter.example.json` 作为 repo-side template，而 machine-local 文件保持不入仓
- runtime 子系统当前足够小，可以通过 smoke tests 驱动 contract 收紧

## Waiver

暂无。

## Requirement Review

该需求属于 runtime productization 子问题，会改变 machine-local adapter contract 与 first-run diagnostics 语义，但不涉及业务 API 或 Java sample；按 L2 路由合理。
