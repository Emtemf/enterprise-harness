# Design

## Requirement Alignment

本 change 对应 issue #13，目标是在不扩大到完整 runtime/distribution productization 的前提下，收紧：

1. local adapter schema
2. installer / setup / doctor / sync diagnostics

## Current-State Evidence

当前 runtime 状态：

- `lib/local-adapter.mjs` 只做最小字段存在性检查
- `local-adapter.example.json` 是 happy-path 示例，不提供更强语义说明
- `setup-local-adapter.mjs` 只负责生成或浅合并
- `doctor.mjs` / `sync.mjs` 会展示 adapter errors，但输出仍偏“拼接字符串”，没有明确字段级诊断面
- `readLocalAdapter()` 当前直接 `JSON.parse` 本机文件，malformed JSON / 读取失败还不会被转成结构化 diagnostics

## Selected Approach

### 1. 保持 schemaVersion=1，不引入新版本迁移机制
当前 issue 先收紧字段语义，不在本轮引入 `schemaVersion=2`。

这意味着：
- 仍基于现有 machine-local 文件路径
- 通过更强校验与更清晰的诊断来提升 first-run / migration 体验
- migration 说明先以 diagnostics + docs 表达，而不是版本跃迁

### 2. local adapter 字段语义分层
第一版收紧为：

- hard required:
  - `schemaVersion`
  - `runtimeVersion`
  - `nodeCommand`
  - `context7.mode`
  - `mcp.projectConfig`
  - `mcp.requiresLocalApproval`
- soft required / warn:
  - `codegraphCommand`
  - `context7.apiKeyEnvVar`

这样可以反映真实运行面：
- `nodeCommand` / project config 是 runtime 基础
- `codegraph` / `Context7` 在当前环境允许 degraded mode，因此更适合 warning 而不是 adapter invalid hard fail

### 3. 结构化 diagnostics 最小契约
本轮冻结统一的 problem contract，至少包含：

- `path`: 字段路径，如 `context7.apiKeyEnvVar`
- `code`: 稳定 machine-readable code，如 `missing-required-field` / `missing-warn-field` / `invalid-type` / `invalid-json` / `io-read-failed`
- `severity`: `error | warn`
- `message`: 面向人类的短说明
- `nextAction`: 建议动作
- `source`: `validator | read | setup | doctor | sync`

要求：
- `validateLocalAdapterData()` 返回结构化 problems，而不是 string array
- `readLocalAdapter()` 遇到 malformed JSON / 读取失败时，也必须返回 problem 列表，而不是直接抛错
- `doctor --json` / `sync --json` 透传这些结构化 diagnostics，而不是只拼接字符串
- 为了 deterministic smoke，`readLocalAdapter()` 的读取逻辑需要允许在测试中注入 fake reader / fake file content，而不是依赖真实权限位或损坏本机文件来制造 RED

### 4. diagnostics 职责拆分
- `setup-local-adapter.mjs`：负责生成/合并模板，并在输出中明确哪些字段仍需人工确认
- `doctor.mjs`：给出字段级 diagnostics 与 severity
- `sync.mjs`：把“缺 adapter / 缺字段 / 缺环境变量”的 next action 讲清楚
- `install.mjs`：本轮只透传 `setup-local-adapter.mjs` 的收紧结果，不新增独立 diagnostics contract，避免范围外扩
- 所有这些入口的 smoke 都应在固定 temp repo + fixed `HARNESS_LOCAL_ADAPTER` + fake bootstrap marker + PATH stubs（如 `codegraph` / `npx`）下执行，避免读取当前机器真实状态

### 5. 必须覆盖 malformed JSON / IO failure
本轮显式把以下失败路径纳入设计：

- machine-local adapter 文件不存在
- adapter 文件是损坏 JSON
- adapter 文件读取失败 / 权限或 IO 异常
- 字段缺失 / 类型错误

这些都必须进入统一 diagnostics contract，而不是崩溃退出。

### 6. 不触碰 release-local / source-external smoke
这些属于 #15 / #10，更大范围的问题，不在本 change 内。

### 7. Java architecture rules
- N/A for this change
- 本变更属于 Node runtime 脚本与 machine-local adapter contract，不涉及 Java repository port / DTO / Entity / Mapper 设计

## Affected Files

### 必改
- `harness/plugin/runtime/lib/local-adapter.mjs`
- `harness/plugin/runtime/local-adapter.example.json`
- `harness/plugin/runtime/setup-local-adapter.mjs`
- `harness/plugin/runtime/doctor.mjs`
- `harness/plugin/runtime/sync.mjs`
- `harness/plugin/runtime/install.mjs`

### 测试侧
- 新增 adapter schema / diagnostics smoke
- 新增 malformed JSON / missing field / merge behavior fixtures

## Testing Strategy

### Fixture / isolation baseline
后续所有 task 的定向验证都应在固定 temp repo 与固定 `HARNESS_LOCAL_ADAPTER` 路径下执行，避免直接依赖当前机器真实 adapter、真实 `CONTEXT7_API_KEY`、真实 bootstrap marker、或真实工具安装状态。

### Task 1：adapter validator 收紧
- RED：基于固定 fixtures（missing field / warning field / malformed JSON / missing file / simulated read failure），观察当前 validator 不能区分 hard fail / warn，也不能返回结构化 field-level problems
- GREEN：返回结构化 field-level problems + malformed JSON / IO problems
- VERIFY：仅运行定向 smoke，不直接把真实 `doctor --json` 当成 task-level 证据

### Task 2：setup / doctor / sync diagnostics 收紧
- RED：基于固定 temp repo + `HARNESS_LOCAL_ADAPTER` fixture，观察当前命令没有字段级 diagnostics、setup 不报告人工确认项、doctor/sync next actions 不清
- GREEN：输出字段级 diagnostics 与 next actions，并覆盖 dry-run / `--write` merge 行为
- VERIFY：仍通过同一组 temp-repo smoke 证明，不直接依赖当前机器真实 adapter 路径或环境变量

### Task 3：docs / validation 对齐
- RED：README / runtime README / validation 中缺少新 contract 说明
- GREEN：精确断言通过
- VERIFY：docs assertions + smoke 结果摘要，而不是再依赖机器状态敏感命令

## Risks

- 若把当前可降级字段收成 hard fail，会让本地接入体验反而变差
- 若继续只返回平面错误字符串，后续 smoke 与机器消费仍然脆弱
- 若 setup/doctor/sync 之间职责不清，会出现重复或冲突的提示

## Rollout / Rollback

- rollout：先以最小 schema/diagnostics 收紧落地，再视 issue #10 的更大 productization 需要扩展
- rollback：若 hard/soft required 判定过严，可调回 warning，而不撤掉字段级诊断结构本身
