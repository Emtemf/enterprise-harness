# Change

## 原始需求

上一轮 `gate-tightening-skeleton`（已 `VALIDATED`）修复完成后，尝试 `lifecycle archive` 时被
`isReferencedByTests` 拦截。design 阶段第一轮评审（design-reviewer block）纠正了范围误判：
`grep -rln "gate-tightening-skeleton" harness/plugin/runtime/test/*.mjs` 实际命中 **4 个**测试文件，不是最初
探索认为的 1 个：`gate-hardening-design-gate-smoke.mjs`、`gate-hardening-task-state-smoke.mjs`、
`gate-hardening-review-validation-smoke.mjs`、`gate-hardening-validation-digest-smoke.mjs`——全部都硬编码引用
`harness/changes/gate-tightening-skeleton` 作为测试 fixture（读取并清理其 `state.json` 的 `gates` 字段）。
用户要求修复这个技术债，使 `gate-tightening-skeleton` 能够被归档。

## 业务结果

以上 4 个测试文件均不再依赖任何真实业务 change 的目录名或状态：复制整仓到临时目录后，先清空该副本
`harness/changes/` 下的全部真实条目，只注入各自测试所需的 fixture change，再运行断言。其中
`gate-hardening-review-validation-smoke.mjs` 还有一处衍生问题：它额外用 `ensureReview()` 对另外 4 个真实
changeId（`intake-smoke-demo`/`phase0-claude-governance-skeleton`/`plugin-runtime-skeleton`/
`reference-service-boundary-realignment`）写入"补齐 reviewer verdict"，本质是同一类"压制真实 change 噪音"的
手法——清空 `harness/changes/` 后这段逻辑也一并移除（不再需要，因为没有真实 change 留在临时副本里）。
修复后 `gate-tightening-skeleton` 上的 `isReferencedByTests` 拦截解除，可以正常归档。

## 非目标

- 不改变这 4 个测试验证的 gate 语义本身（各自原有断言保持不变，只改 fixture 准备方式）
- 不修改 `pre-write.mjs`/`post-write.mjs`/`gates.mjs`/`lifecycle.mjs` 等生产 runtime 代码
- 不处理另一条已记录的同类技术债（`validateOpenApiLight`/`validateControllerConsistency` 硬编码 `reference-service/openapi/order-service.yaml`），那是独立的、影响面更大的问题，留待单独排期
- 不改动 `gate-hardening-red-task-smoke.mjs`（经核实只 spawn `pre-write.mjs` 针对单一文件路径，不调用
  `cli.mjs verify`/`verify.mjs` 做全量扫描，且不含 `gate-tightening-skeleton` 字符串引用，不受此问题影响）

## 归属服务 / 模块 / 业务域

- scope: harness runtime test 自身的 fixture 隔离
- owning module:
  - `harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`
- business domain: 测试基础设施 / runtime governance 自检

## 初步路由

- request shape: modify
- candidate tier: L1
- hard signals: 无（不影响 API/data/architecture/rule，多个测试文件的局部同类修复）
- reason: 只改测试文件的 fixture 构造方式，不改变任何生产 runtime 语义；虽涉及 4 个文件，但改动模式完全一致
  （统一的"清空 harness/changes/ 后注入所需 fixture"），复杂度未超出 L1

## 最小探索证据

见 `harness/changes/smoke-fixture-decoupling/evidence/`：
- 第一轮探索遗漏了 3 个文件，design-reviewer 第一轮 block 已纠正（见 `reviews/design-reviewer.json`）
- `grep -rln "gate-tightening-skeleton" harness/plugin/runtime/test/*.mjs` 精确命中 4 个文件，无遗漏
- 确认 4 个文件均在 `createTempRepo()` 之后、任何 `createChange()` 之前有相同结构的
  "读取 skeleton state.json → 删除 gates 字段 → 写回"代码块，改法一致
- 额外确认 `gate-hardening-review-validation-smoke.mjs` 还有 `normalizedReviews` 循环对 4 个其他真实 changeId
  做同类噪音压制，清空 `harness/changes/` 后一并移除
- 确认断言逻辑均不检查 `problems`/输出的总量，只检查特定字符串是否出现，与"清空后只留所需 fixture"的修法兼容

## 最终路由

- final tier: L1
- owning scope: 上述 4 个测试文件
- next focus: design 阶段已完成"清空临时副本 harness/changes/"的具体实现方式与验证策略（第二轮，范围已扩大到 4 个文件）

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: no

## 需要确认的决策（clarify 已确认）

- 采用**结构性修复**：清空临时副本的 `harness/changes/` 后只注入各测试所需的 fixture change，不依赖任何真实
  change 状态；范围从最初认为的 1 个文件扩大到实际验证出的 4 个文件

## 假设

- 4 个测试各自的断言在清空其他真实 change 后依然能被触发，不依赖真实 change 提供任何背景 problems/reviews
- `gate-hardening-review-validation-smoke.mjs` 的 `normalizedReviews` 循环移除后，其自身注入的 fixture change
  仍能让 `hasReviewerFailure`/`hasVerifyStaleFailure`/`hasStopReviewerBlock`/`hasStopReviewedStaleBlock`/
  `hasStopValidatedStaleBlock` 这 5 条断言按预期通过（需在 TDD 阶段用 GREEN 证据实测确认，而非假设）

## Waiver

不适用。

## Requirement Review

待 `requirement-reviewer` 消费（L1 tier，按仓库惯例 L1 是否强制要求 requirement-reviewer 待 design 阶段确认；
若按当前 blocking reviewer 清单执行，本轮仍会经过 design-reviewer/plan-critic/verification-reviewer 的常规链路）。
