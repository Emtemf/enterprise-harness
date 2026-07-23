# Progress

> 快照更新时间：2026-07-23。本文件是人工维护的阶段快照与阅读入口，
> **不替代动态状态真相**（动态真相以 `harness/ACTIVE_CHANGE` + `harness/changes/*/state.json` 为准）。

## 当前阶段

- clarify-first staged orchestrator 主线（骨架 + 执行深化）两批工作均已收口到 `VALIDATED`。
- **插件分发机制已落地**：可通过 `/plugin marketplace add` + `/plugin install` 安装，GitHub Release 自动发布 tarball。
- **`gate-tightening-skeleton`（L3）已 `VALIDATED` 并归档**：修复了 `pre-write.mjs` 机械门禁只保护本仓库自带
  `reference-service/` demo、对任意真实安装的目标项目从不生效的问题（详见「最近完成」）。
- **`smoke-fixture-decoupling`（L1）已 `VALIDATED` 并归档**：解耦了 4 个 `gate-hardening-*-smoke.mjs` 测试对
  真实业务 change 目录的硬编码引用，使 `gate-tightening-skeleton` 得以归档（详见「最近完成」）。
- **`openapi-contract-check-generalization`（L2）已 `VALIDATED` 并归档**：OpenAPI 结构检查（JS + shell）已泛化到任意 `openapi/` 目录下的 YAML 文件；controller consistency 检查则诚实重新定位为 `reference-service` 自身回归检查，不再暗示是通用能力（详见「最近完成」）。
- **`workflow-runner-fixture-isolation`（L1）已 `VALIDATED` 并归档**：修复了 `workflow-runner-smoke.mjs`
  直接在真实仓库根目录上执行 `workflow.mjs run/resume/status` 并污染真实 `harness/ACTIVE_CHANGE` 的问题
  （详见「最近完成」）。之前记录的技术债"workflow-*-smoke 会写真实仓库 active change 状态"已关闭。

## 健康快照（2026-07-23 实测）

- `cli.mjs verify`：contract checks 通过（含版本一致性检查）
- `subagent-contract-smoke.mjs`：green / red / verify 全通过
- `orchestration-guardrail-smoke.mjs`：green / red / verify 全通过
- 关键 orchestrator 合约 smoke：`lane-worker-contract-smoke`、`harness-stage-router-smoke`、`mandatory-gate-contract-smoke`、`clarify-stage-contract-smoke` 全通过
- 插件安装端到端验证：`/plugin install` → 版本 0.1.11 / 0.1.14 / 0.1.15 交付链路可见

## 最近完成

- **`state-schema-migration`（2026-07-23，L2，`VALIDATED`，已归档到 `harness/archive/`）**：
  引入 `state-migration.mjs` 模块，在 `loadActiveChange` 读取 `state.json` 时自动检测 `schemaVersion`
  并补齐缺失字段（`workflow.*`/`gates.redTask`/`redEvidenceRef`），写回磁盘持久化。`schemaVersion`
  从 1 升到 2；旧版本 1 的 state.json 缺 `workflow.*` 时自动补默认值，`redVerified=true` 但缺关联字段时
  重置为 `false`。新增 6 组 backward-compat 回归测试，确认旧格式 state.json 在新代码下自动迁移、
  `validateArtifactStates` 无错误、磁盘已更新。同时修复了 issue #38 反映的 `pre-write.mjs` 错误信息
  硬编码 "reference-service" 问题。
- **`subagent-orchestration-contract`（2026-07-23，L1，`VALIDATED`，已发布为 `v0.1.15`）**：
  修复弱模型场景下 subagent 探索标题被写成 `Explore enterprise-harness codebase`、主 orchestrator
  忽略 subagent 结论并重复探索的问题（issue #41 / #42 / #43 / #44 / #45 / #46）。在
  `/harness`、`/harness-intake`、`code-explore`、`impact-explore` 与验收文档里显式新增
  subagent 标题必须对准用户项目、结论必须被消费、禁止重复探索的契约；新增
  `subagent-contract-smoke.mjs` 做机械回归保护。
- **`phase-skip-orchestration-hardening`（2026-07-23，L1，`VALIDATED`，已发布为 `v0.1.15` 补丁）**：
  把”未完成 clarify/route 前不得实现”从散点禁止项提升为显式 orchestration guardrail，
  落到 `/harness`、`/harness-intake`、`CLAUDE.md`、`staged-workflow.md`、验收文档与新增
  `orchestration-guardrail-smoke.mjs`；同时补齐 `manifest.json` / `plugin.json` 版本一致性。
- **`generic-openapi-controller-consistency-checker`（2026-07-23，L2，`VALIDATED`，已发布为 `v0.1.16`）**：
  新增 `validateGenericControllerConsistency`，自动扫描任意项目的 `openapi/*.yaml` 与 `*Controller.java`，
  比对 path + HTTP method 对齐，检测 OpenAPI 契约与 Spring Controller 之间的漂移。已集成到 post-write hook
  和 `cli verify`。regex 实现，不依赖外部 YAML/Java parser；5 个 fixture 场景 + reference-service 回归验证。
  修复了此前只有硬编码 reference-service demo 检查、对用户项目静默 no-op 的问题。
- **`pre-write-design-existence-gate`（2026-07-23，L1，`VALIDATED`，已发布为 `v0.1.17`）**：
  pre-write.mjs 新增 design.md 存在性拦截：active change 存在但 design.md 缺失时，写入受治理路径直接 BLOCK。
  修复了弱模型澄清完直接跳到实现、跳过 design 阶段的问题（issue #48）。同时将 subagent_type 强制约束
  写入 skill（`code-explore` / `impact-explore`，禁止 `general-purpose`），修复 issue #47。
- **`pre-write-full-stage-guards`（2026-07-23，L1，`VALIDATED`，已发布为 `v0.1.18`）**：
  将 pre-write.mjs 从单一 design.md 检查升级为完整的阶段产物守卫系统。写入受治理路径时，pre-write hook
  根据当前 workflow stage 机械校验 clarify/route/design/plan 各阶段的产出物是否齐全，模型跳过任何阶段
  都会被程序级 BLOCK。10 个 fixture 场景覆盖所有阶段守卫路径。
- **`workflow-runner-fixture-isolation`（2026-07-23，L1，`VALIDATED`，已归档到 `harness/archive/`）**：
  修复 `workflow-runner-smoke.mjs` 直接在真实仓库根目录上执行 `workflow.mjs run/resume/status`、
  并把 `harness/ACTIVE_CHANGE` 覆写成 `test-runner-smoke` 的问题。改为复制整仓到临时副本，在副本内运行全部
  workflow 命令，`cleanup` 通过 `process.on('exit', cleanup)` + `try/finally` 双重保护确保临时副本被清理，
  `repoRoot` 保持 `fileURLToPath` 动态计算。验证结果：运行后真实仓库 `ACTIVE_CHANGE` 未被污染、`/tmp` 无泄漏、
  `test-runner-smoke` 不存在于真实 `harness/changes/`。经 `design-reviewer`（一轮）、`plan-critic`（一轮）、
  `verification-reviewer` 全部 pass。
- **`red-task-fixture-decoupling`（2026-07-22，L1，`VALIDATED`，已归档到 `harness/archive/`）**：修复
  `gate-hardening-red-task-smoke.mjs` 硬编码引用真实业务 change `gate-hardening-semantics` 的技术债：改为
  复制整仓后先清空临时副本 `harness/changes/`，只注入 synthetic fixture `red-task-smoke-fixture`，并显式把
  `fixtureState.changeId` 改写为 synthetic id；新增 `gate-hardening-red-task-fixture-guard-smoke.mjs` 动态枚举
  真实 changeId 做回归防护。经 `design-reviewer`（advisory）、`plan-critic`（一轮）、`verification-reviewer`
  （两轮收口）完成后，`gate-hardening-semantics` 已成功 `lifecycle archive`。
- **`openapi-contract-check-generalization`（2026-07-22，L2，`VALIDATED`，已归档到 `harness/archive/`）**：
  `validateOpenApiLight` / `validate-openapi.sh` 已泛化为任意 `openapi/` 目录下 YAML 文件的基础结构检查
  （`openapi:` / `paths:` / `components:` 顶层 key），修复了这套契约检测此前只保护 `reference-service` demo、
  对任意真实目标项目静默 no-op 的问题；同时把 `validateControllerConsistency` 诚实重新定位并改名为
  `validateReferenceServiceControllerConsistency`，shell 脚本保留文件名但通过注释明确仅用于 `reference-service`
  自身回归检查，不再暗示是通用 controller/OpenAPI 交叉校验器。经 `design-reviewer`（两轮）、`plan-critic`
  （一轮）、`verification-reviewer`（两轮收口）全部 pass，并已完成 fresh validation 与归档。
- **`smoke-fixture-decoupling`（2026-07-22，L1，`VALIDATED`，已归档到 `harness/archive/`）**：修复
  `harness/plugin/runtime/test/` 下 4 个
  `gate-hardening-*-smoke.mjs`（`design-gate`/`task-state`/`review-validation`/`validation-digest`）硬编码
  引用真实业务 change 目录（`gate-tightening-skeleton` 及另外 4 个真实 changeId）的技术债：改为复制整仓后先清空
  临时副本 `harness/changes/`，只注入各测试自己需要的合成 fixture；新增 `gate-hardening-fixture-guard-smoke.mjs`
  动态枚举真实 changeId 做回归防护（自身也不写死任何 changeId 字面量，避免自引用悖论）。经 `design-reviewer`
  （三轮）、`plan-critic`（一轮）、`verification-reviewer`（一轮）全部 pass。修复后 `gate-tightening-skeleton`
  的 `isReferencedByTests` 拦截解除，已成功 `lifecycle archive`。
- **`gate-tightening-skeleton`（2026-07-22，L3，`VALIDATED`，已归档到 `harness/archive/`）**：
  `harness/plugin/runtime/lib/gates.mjs` 的 `isGovernedTarget`/`requiredGateForTarget` 从硬编码
  `reference-service/{src/main,src/test,openapi}` 改为路径片段子序列匹配（`src/main/java`/`src/test/java`/
  `openapi`，黑名单只检查匹配位置之前的祖先段），使 `pre-write.mjs` 的机械门禁（`designApproved`/RED 拦截）在
  任意真实安装的目标项目里也能生效，不再只保护本仓库自带的 `reference-service` demo。同时修复 `post-write.mjs`
  的 `isHarnessManaged` 判定过严问题（新增 `hasChangeTracking`，只要求 `harness/changes/` 存在，不再额外要求
  `harness/specs/`）。经 `design-reviewer`（两轮）、`plan-critic`（一轮）、`verification-reviewer`（两轮）全部
  pass。归档解除动作见上方 `smoke-fixture-decoupling`。
- 三层入口模型已成形：普通用户 `/harness`、维护层 runtime CLI、hooks
- 普通用户单入口 `/harness` 收口已完成，并已同步 GitHub description
- clarify-first staged orchestrator 第一版骨架（contract / template / worker / guidance / workflow-state / smoke）已 `VALIDATED`
- orchestrator 执行深化（`orchestrator-execution-deepening`，L3）已 `VALIDATED`
- repo-facing `AGENTS.md` 已落地；`release-local` 本地源外 smoke 路径已落地；containerization / sandboxing 指南已落地
- reference-service 第一批 boundary realignment 已 `VALIDATED`
- **归档清理（2026-07-21）**：4 个已完成变更移入 `harness/archive/`：
  `java-golden-real-http-openapi`、`runtime-adapter-diagnostics-hardening`、
  `runtime-installability-polish`、`runtime-productization-polish`

## 当前 active change

- 运行时权威 active 指针（`harness/ACTIVE_CHANGE`，本地 gitignored）：`clarify-first-staged-orchestrator`
- 状态：`VALIDATED` / `workflow.stage=verify`；其执行深化 `orchestrator-execution-deepening` 同为 `VALIDATED`
- 含义：orchestrator 主线已收口，指针停在最后触达的变更上，并非有未完成实现

## 变更清单（changes/，post-archive）

- `VALIDATED`：clarify-first-staged-orchestrator、orchestrator-execution-deepening、
  java-golden-quality-gates、intake-smoke-demo、
  phase0-claude-governance-skeleton、plugin-runtime-skeleton、
  reference-service-boundary-realignment、session-lifecycle-progress、add-enterprise-harness-mvp
- 未推完（候选下一步）：
  - `SPECIFIED`：pi-containerization-guidance、pi-inspired-improvements、pi-runtime-followups
- 已归档（`harness/archive/`）：state-schema-migration、workflow-runner-fixture-isolation、red-task-fixture-decoupling、openapi-contract-check-generalization、smoke-fixture-decoupling、gate-tightening-skeleton、gate-hardening-semantics、draft-gate-demo、
  release-local-source-external-smoke、java-golden-real-http-openapi、runtime-adapter-diagnostics-hardening、
  runtime-installability-polish、runtime-productization-polish

## 动态真相

- 动态真相优先级：`harness/ACTIVE_CHANGE` + `harness/changes/*/state.json`
- 本文件用途：人工维护的阶段快照与阅读入口，不替代动态状态真相

## 下一步重点

- 从三个 `SPECIFIED` 的 `pi-*` 变更中选定下一轮选题，经 `/harness` 路由推进
- 继续深化 `workflow.*` 与 legacy state/approvals/validation 的协同表达
- 在 design / plan / tdd / verify 阶段逐步接入 exploration lane 的真实调度策略
- 结合 open issues #20 / #8 / #11，把 task 子状态、tier-specific artifact matrix 与 automation-first lifecycle runner 继续收口到运行时行为
- 中期继续衔接 #9/#12（Java golden sample）与 #10/#13/#15（runtime/distribution productization）
- ~~`validateOpenApiLight`/`validateControllerConsistency`（`harness/plugin/runtime/lib/checks.mjs`）仍硬编码
  `reference-service/openapi/order-service.yaml` 等固定路径，与 `gate-tightening-skeleton` 修复前的
  `isGovernedTarget` 是同类问题~~——已由 `openapi-contract-check-generalization`（2026-07-22，L2，`VALIDATED`）修复；controller consistency 已诚实重新定位为 `reference-service` 自身回归检查
- ~~技术债：修复 `workflow-*-smoke` 会写真实仓库 active change 状态的副作用（应在临时副本中运行）~~——
  已由 `workflow-runner-fixture-isolation`（2026-07-23，L1，`VALIDATED`）修复
- ~~技术债：`gate-hardening-design-gate-smoke.mjs` 等测试硬编码引用真实业务 change 目录导致无法归档~~——
  已由 `smoke-fixture-decoupling`（2026-07-22，L1，`VALIDATED`）修复
- ~~技术债：`gate-hardening-red-task-smoke.mjs` 硬编码引用 `gate-hardening-semantics` 导致无法归档~~——
  已由 `red-task-fixture-decoupling`（2026-07-22，L1，`VALIDATED`）修复
- 技术债：`workflow.mjs` 中的 `ensureWorkflowShape` 与 `state-migration.mjs` 的迁移逻辑高度重叠，
  两套并存可能随时间漂移，需要独立 change 统一（见 `state-schema-migration` design.md Non-goals 注释）

## 推荐先读

1. `README.md`
2. `AGENTS.md`
3. `CLAUDE.md`
4. `harness/specs/staged-workflow.md`
5. `harness/specs/session-lifecycle.md`
6. `harness/changes/clarify-first-staged-orchestrator/`
