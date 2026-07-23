# Design

## Role Ownership
- 主导角色：Principal Architect 视角（L1，轻量设计）
- 参与角色：Fullstack Developer / Quality Engineer
- 本阶段交接物：`design.md`

## Current-State Evidence

- `gate-hardening-red-task-smoke.mjs` 当前流程：
  1. `copyDir(repoRoot, repoCopy)` 整仓复制
  2. 直接把 `harness/ACTIVE_CHANGE` 写成 `gate-hardening-semantics`
  3. 读取并改写 `harness/changes/gate-hardening-semantics/state.json`
  4. 对副本内真实 `reference-service/src/main/java/.../OrderCancellationController.java` 运行 `pre-write.mjs`
- `grep -rln "gate-hardening-semantics" harness/plugin/runtime/test/*.mjs` 仅命中这一个文件；与 `smoke-fixture-decoupling`
  不同，本轮影响面仅 1 个测试文件
- 该测试不调用 `cli.mjs verify`/`verify.mjs`，只 `spawnSync` `pre-write.mjs` 针对单一目标文件路径做 RED 门禁回归
- 这意味着它的问题不是"全量扫描夹具带入真实 change 噪音"，而是更直接的：**源码里硬编码了真实 changeId 字符串**，
  会被 `lifecycle.mjs:isReferencedByTests()` 的静态子串扫描命中，从而阻止 `gate-hardening-semantics` 归档

## Scope / Non-goals

范围内：
- 仅修 `harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs` 的 fixture 构造方式
- 解除 `gate-hardening-semantics` 被该测试硬编码引用导致的 `archive` 阻断

非目标：
- 不改变 `pre-write.mjs` / `gates.mjs` / `checks.mjs` 的生产门禁语义
- 不扩展到其他测试文件（其他同类问题已在 `PROGRESS.md` 分别记录）
- 不把这个测试改造成全新的 helper/抽象层（范围过小，先做最小修复）

## Options Considered

### Option A：最小改动，继续依赖真实 change，只把 `gate-hardening-semantics` 换成别的专用名字
治标不治本，未来仍会有另一个真实 change 被字符串扫描拦住。

### Option B：结构性修复——整仓复制后先清空 `harness/changes/`，再只注入本测试自己需要的合成 fixture
与 `smoke-fixture-decoupling` 已验证成功的模式一致，直接消除对任何真实 changeId 的依赖。

## Selected Option and Rationale

选择 **Option B**。

理由：
- 本测试真实目的只是验证：对生产路径写入时，`pre-write.mjs` 会在缺少 currentTask-scoped RED 证据时 BLOCK，
  在 `redTask` / `redEvidenceRef` 匹配后放行
- 它并不需要真实 `gate-hardening-semantics` 的任何业务内容，只需要一个满足该断言的最小 `state.json` fixture
- 复用 `smoke-fixture-decoupling` 的模式，风险最低、认知成本最低

## Rejected Options

拒绝 Option A：既然 `isReferencedByTests()` 是对测试源码做纯字符串扫描，任何继续把真实 changeId 写进源码的做法，
都只是把问题推迟到下一个名字上。

## Affected Layers

- test layer：`harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs`
- 不涉及 runtime / rules / specs / Java 业务代码

## Interface Contract
- External API: 不适用
- Internal service contract: 该测试文件本身无导出接口，仍保持 `red|green|verify` 三态可执行脚本契约
- Compatibility / caller impact: 无其他文件 import 该测试文件；改动不会影响调用方

## Data / SQL Design
不适用。

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
不适用（纯测试基础设施改动）。

## Flow / State Changes

新的 fixture 准备流程：
1. `createTempRepo()` 之后立即：
   ```js
   fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
   ```
2. 在副本里写入一个新的、测试专用的 changeId（例如 `red-task-smoke-fixture`）到 `harness/ACTIVE_CHANGE`
3. 在 `harness/changes/red-task-smoke-fixture/state.json` 写入来自
   `fixtures/red-task-missing-proof/state.json` 的 fixture 内容，**并在写入前显式把 `fixtureState.changeId`
   改写为 `red-task-smoke-fixture`**（回应 design-reviewer advisory：不允许留下 synthetic fixture 目录名与
   state.json 内嵌 `changeId` 不一致的 durable state）
4. 后续仍然用同一个目标文件：
   `reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`
   去触发 `pre-write.mjs`，断言 BLOCK / PASS 两种路径

## Cross-layer Type and Mapper Matrix
不适用。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
`fs.rmSync(..., { force: true })` 对目录不存在的情况安全，不需要额外 try/catch。

## Transaction Boundaries
不适用。

## Testing Strategy
- 新增一个 guard smoke：`harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs`
  - 运行时动态枚举 `harness/changes/` 下全部真实 changeId
  - 读取 `gate-hardening-red-task-smoke.mjs` 源码文本
  - 断言其中不包含任何真实 changeId 子串
  - 不在源码中写死任何具体真实 changeId 字面量（避免自我引用悖论，沿用 `smoke-fixture-decoupling` 的经验）
- 既有功能回归：`gate-hardening-red-task-smoke.mjs green`
  - 必须仍能证明：
    - 第一次写入因缺 `currentTask-scoped red verification` 被 BLOCK（`status===2`，输出含该错误文案）
    - 第二次在 `redTask` 与 `redEvidenceRef` 对齐后放行（`status===0`）

### RED path
- `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs red`
  - 预期：当前源码仍含 `gate-hardening-semantics`，脚本 fail（非 0）

### GREEN path
- `node harness/plugin/runtime/test/gate-hardening-red-task-fixture-guard-smoke.mjs green`
- `node harness/plugin/runtime/test/gate-hardening-red-task-smoke.mjs green`
  - 预期：guard 0 命中；原有 BLOCK / PASS 行为都不变

## Rollout and Rollback
- 单文件测试代码 + 一个新 guard smoke，随本地 smoke/verify 立即生效，无需发布/迁移
- 回滚：还原该测试文件与新增 guard 即可

## Risks
- 该测试依赖 `fixtures/red-task-missing-proof/state.json` 的字段组合；若该 fixture 本身隐含依赖真实 change 的其他上下文，
  会在 `gate-hardening-red-task-smoke.mjs green` 时暴露
- 因为本测试不调用 `cli.mjs verify`，不像 `smoke-fixture-decoupling` 那样有多 change 扫描噪音，理论风险较低

## Open Questions
- 这个 guard smoke 是否也应纳入一个统一的“真实 changeId 硬编码检测”体系？本轮不抽象，先做最小实现

## Design Self-Review
- 覆盖 clarify 决策：✅（结构性修复）
- 范围克制：✅（只动一个测试文件 + 一个 guard）
- 复用已验证模式：✅（沿用 `smoke-fixture-decoupling` 的 guard + 清空 `harness/changes/` 方案）

## Approval
待 `design-reviewer` 消费。
