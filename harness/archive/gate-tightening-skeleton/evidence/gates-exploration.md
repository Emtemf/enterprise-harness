# Exploration

## Topic

`isGovernedTarget` / `requiredGateForTarget`（`harness/plugin/runtime/lib/gates.mjs`）硬编码只识别本仓库自带的
`reference-service/{src/main,src/test,openapi}`，导致 `pre-write.mjs` 的机械门禁（designApproved / RED verified 拦截）
只在本仓库自身生效，插件安装到任意真实目标项目后从不触发（该项目通常不存在字面意义的 `reference-service/` 目录）。

## Date

2026-07-22

## Request Shape

modify（收紧既有 runtime gate 的适用范围，不新增业务能力）

## Candidate Tier

L3（architecture_change + rule_change：改变 `harness/plugin/runtime/` 门禁语义与 `state.json` schema 的消费方式）

## Owning Module / Domain / Service

`harness/plugin/runtime/lib/gates.mjs` + 相关 hooks（`pre-write.mjs`、`post-write.mjs`）+ `state.json` schema / local adapter schema

## Codegraph Attempt

- Status: available（`codegraph status`: 125 files / 2106 nodes indexed）
- Queries:
  - `codegraph_explore("isGovernedTarget requiredGateForTarget loadLocalAdapter local-adapter governed path config setup-local-adapter")`
  - `codegraph_impact("isGovernedTarget", depth=2)`
- Key Findings:
  - `isGovernedTarget`（`gates.mjs:17-24`）与 `requiredGateForTarget`（`gates.mjs:26-37`）把受治理路径硬编码为
    `<root>/reference-service/{src/main,src/test,openapi}` 三个目录，`root = process.cwd()`（`checks.mjs:6`，即插件运行所在的目标项目根）。
  - `isGovernedTarget` 被 `pre-write.mjs`（唯一做机械 BLOCK 的 hook）与 `post-write.mjs`（标记 validation 为 stale）调用，
    codegraph 标注两处调用 **均无覆盖测试**（"⚠️ no covering tests found"）。
  - `post-write.mjs:10-12` 还有第二层同类问题：`if (!isHarnessManaged(root)) { process.exit(0); }`——目标项目若没有
    `harness/changes/` + `harness/specs/` 目录（`checks.mjs: isHarnessManaged`），post-write 结构/证据校验整体是 no-op。
  - `bootstrap.mjs` 当前极简，只写一个 `.bootstrap-ran` marker，不会在目标项目中创建 `harness/changes`/`harness/specs`
    骨架；`start-change.mjs` 只创建 `harness/changes/<id>/`。
  - 现有唯一的"本地配置"机制是 `local-adapter.example.json` / `lib/local-adapter.mjs`：字段仅有
    `nodeCommand` / `codegraphCommand` / `context7.*` / `mcp.*`，**没有任何字段用于声明目标项目自己的受治理源码路径**。
  - `harness/templates/state.json` 的 `gates` 字段只有 `designApproved` / `redVerified` / `redTask` / `redEvidenceRef`，
    同样没有"受治理路径列表"的位置。
  - `mandatory-gate-contract-smoke.mjs` 等一批门禁相关 smoke test，验证方式是字符串匹配 `.claude/skills/*/SKILL.md`
    是否包含特定句子，而不是真实触发 hook 验证运行时行为——这类测试不会暴露本次发现的问题。
- Fallback Reason: 无需 fallback，codegraph 索引可用且覆盖到全部相关符号。

## Context7 / Documentation Attempt

- Library Name: 不适用（纯仓库内部 runtime governance 逻辑，不涉及外部库/框架/SDK 版本行为）
- Resolved Library ID:
- Version:
- Query:
- Key Findings:
- Fallback Reason: 跳过原因——纯业务规则变更，不改变外部库使用方式，本地代码已足够说明行为（符合 `.claude/rules/20-documentation.md` 的跳过条件）。

## Impact Summary

- API: no
- Data: no
- Architecture: yes（改变 runtime 门禁如何识别"受治理路径"，以及 `state.json` / local adapter schema 是否需要新增字段）
- Rule: yes（`.claude/rules/00-workflow.md` 中"硬门禁"章节的语义覆盖范围会被本次改动重新定义）

## Unknowns

- 目标项目应如何声明自己的受治理路径：自动探测常见约定（如 `src/main/java` + `src/test/java` + `openapi/*.yaml`）、
  显式配置（新增 schema 字段，由 onboarding 步骤写入）、还是两者结合？
- 声明粒度：按目标项目根下的固定相对路径列表，还是允许按 change 粒度（不同 change 可能治理不同子模块）？
- 是否需要向后兼容：本仓库自己的 `reference-service` demo 依然要继续被门禁保护，不能在泛化过程中失效。
- `post-write.mjs` 的 `isHarnessManaged` no-op 问题是否在本次一并收口，还是拆分为后续 change（当前判断为同一根因的两个症状，倾向于一并处理，但需要用户确认范围）。

## Decisions Required

- 受治理路径的声明方式（见下方 clarify 提问）
- 是否本次一并修复 `post-write.mjs` 的 `isHarnessManaged` 前置条件问题

## Confidence

高。已通过 codegraph_explore + codegraph_impact 拿到 `gates.mjs`、`pre-write.mjs`、`post-write.mjs`、
`setup-local-adapter.mjs`、`checks.mjs`、`local-adapter.example.json`、`templates/state.json` 的直接证据，
且历史 change（`gate-hardening-semantics`，`change.md`/`design.md`）已自行记录"pre-write 目前只在 governed path
上消费 designApproved 与 redVerified"这一已知局限，与本次独立探索结论一致，交叉印证充分。
