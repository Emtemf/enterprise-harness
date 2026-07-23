# Exploration

## Topic

`harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs` 硬编码引用真实业务 change 目录
`gate-tightening-skeleton` 作为测试 fixture 清理对象，导致该真实 change 即便已 `VALIDATED` 也无法 `lifecycle archive`
（被 `isReferencedByTests` 机械拦截）。

## Date

2026-07-22

## Request Shape

modify（修复既有 runtime 测试的 fixture 隔离方式，不涉及生产 runtime 行为）

## Candidate Tier

L1（单文件局部行为变化，不影响 API/data/architecture/rule，只改一个测试文件的 fixture 构造方式）

## Owning Module / Domain / Service

`harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`

## Codegraph Attempt

- Status: available
- Queries: `Read` 直接读取该测试文件全文（已在上一轮 gate-tightening-skeleton change 中读过，本轮复用已知内容并重新核实）
- Key Findings:
  - 该测试用 `copyDir(repoRoot, repoCopy)` 把**整个真实仓库**（含全部真实 `harness/changes/*`）复制到临时目录，
    再对该副本运行 `spawnSync('node', [cliPath, 'verify', '--json'], {cwd: repoCopy})`
  - `cli.mjs verify` 内部的 `validateArtifactStates`/`validateReviewVerdicts`/`validateChangeEvidence` 会扫描
    副本里**全部** `harness/changes/*`，不只是该测试自己注入的 3 个 fixture change
    （`design-gate-missing-review`/`design-gate-missing-approval`/`design-gate-blocked-review`）
  - 测试断言只检查 `problems` 数组里**存在**这 3 条预期错误（`hasMissingReviewFailure`/`hasMissingApprovalFailure`/
    `hasBlockedReviewFailure`），不检查 `problems` 数组的**总数**——理论上其他真实 change 混入的额外 problems
    不会让断言失败，只要这 3 条预期错误确实出现
  - 但该测试仍特意对 `gate-tightening-skeleton` 做特殊处理（读取其 `state.json`、删除 `gates` 字段后再写回副本），
    说明作者曾观察到"不处理就会引入意外副作用"（很可能是该 change 早期处于不完整/占位状态时，其 `gates`/`state`
    组合触发了某种连带 `validateArtifactStates` 报错，进而干扰了断言判定的确定性）
  - 用 `grep` 交叉核对同类测试 `gate-hardening-red-task-smoke.mjs`/`gate-hardening-validation-digest-smoke.mjs`：
    两者虽然同样 `copyDir` 整仓，但只 `spawnSync` `pre-write.mjs`/`post-write.mjs` 针对**单个特定文件路径**，
    不调用 `cli.mjs verify` 做全量扫描，因此天然不受其他真实 change 状态影响——**只有** `gate-hardening-design-gate-smoke.mjs`
    这一个测试文件有这个结构性脆弱点
  - 这意味着问题不只是"引用了 `gate-tightening-skeleton` 这个名字"，而是"该测试对**任意**真实 change 的当前状态都可能敏感"——
    这次是 `gate-tightening-skeleton`，未来任何其他真实 change 进入不完整/过渡态时都可能重演同样的连带失败
    （这正是上一轮 `verification-reviewer` 发现的 6 个连带失败测试问题的同类根因，但那 6 个是直接对活仓库跑，
    这个是对临时副本跑，性质上更接近"设计层面就该被隔离却没隔离"）
- Fallback Reason: 无需 fallback，直接读源码即可确认结构性事实。

## Context7 / Documentation Attempt

- Library Name: 不适用（纯仓库内部测试隔离问题，不涉及外部库/框架/SDK）
- Fallback Reason: 跳过——纯测试隔离修复，不改变外部库使用方式，本地代码已足够说明行为。

## Impact Summary

- API: no
- Data: no
- Architecture: no
- Rule: no（不改变生产 runtime 门禁语义，只改测试自身的 fixture 隔离方式）

## Unknowns

- 修复方式的取舍：
  - **方案 A（最小改动）**：把"删除 `gate-tightening-skeleton` 的 `gates` 字段"这个特殊处理，原样迁移到一个新建的、
    专用于测试的临时 change 目录名上（比如 `zz-fixture-neutralize-target` 之类），依然保留"整仓复制 + 事后特殊处理某个
    real-looking 目录名"的结构
  - **方案 B（结构性修复）**：复制整仓后，先清空临时副本里 `harness/changes/` 目录下的全部真实条目，再只注入该测试自己需要的
    3 个 fixture change，使测试完全不依赖任何真实 change 的当前状态（不管是 `gate-tightening-skeleton` 还是未来任何其他 change）
  - 方案 A 只是把耦合对象换了个名字，未来任何真实 change 进入不稳定状态时仍可能重演同样问题；方案 B 从根上解决，
    且不影响该测试的断言逻辑（断言只检查特定 3 条错误是否出现，不依赖 `harness/changes/` 目录的其他内容）

## Decisions Required

- 采用方案 A 还是方案 B（将作为 clarify 阶段的问题呈现给用户）

## Confidence

高。已通过 `Read` 直接核实该测试文件全文结构，并交叉核对另外两个同类 `copyDir` 测试的调用方式差异，
确认问题的结构性根因（`cli.mjs verify` 全量扫描 vs. 单文件 hook 调用）与方案 A/B 的技术可行性。
