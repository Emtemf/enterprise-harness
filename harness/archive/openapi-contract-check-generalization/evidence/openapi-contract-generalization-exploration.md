# Exploration

## Topic

`harness/plugin/runtime/lib/checks.mjs` 的 `validateOpenApiLight()` / `validateControllerConsistency()` 硬编码只识别
`reference-service/openapi/order-service.yaml` 与
`reference-service/src/main/java/com/example/orders/interfaces/api/OrderCancellationController.java`，对真实目标项目
（没有这个具体路径）静默 `existsSync` 短路返回 `[]`，OpenAPI 契约漂移检测从不对任意真实安装的目标项目生效。

## Date

2026-07-22

## Request Shape

modify（收紧/泛化既有 runtime 契约检查函数）

## Candidate Tier

初步判断 L2（可能需要拆分为两个不同复杂度的子问题，见 Decisions Required）

## Owning Module / Domain / Service

`harness/plugin/runtime/lib/checks.mjs` + 调用方 `post-write.mjs`/`verify.mjs`

## Codegraph Attempt

- Status: available
- Queries: `codegraph_explore("validateOpenApiLight validateControllerConsistency post-write.mjs verify.mjs OrderCancellationController order-service.yaml")`
- Key Findings:
  - `validateOpenApiLight`（`checks.mjs:441-450`）只检查一个硬编码 YAML 文件是否含 `openapi:`/`paths:`/`components:`
    三个顶层 key——**这是通用结构校验，不含 reference-service 业务语义**，理论上可以像 `gates.mjs` 的
    `detectGovernedKind` 一样，改成自动探测目标项目里的 OpenAPI 文件（复用 `gates.mjs` 已建立的 `openapi` 目录
    约定），逐一做同样的结构校验，泛化成本低
  - `validateControllerConsistency`（`checks.mjs:452-464`）**硬编码了 reference-service 的具体业务语义**：
    YAML 里 `/api/orders/{orderId}/cancel:` 路径字符串、`post:` 方法、Java 侧
    `@RequestMapping("/api/orders")`/`@PostMapping("/{orderId}/cancel")` 注解内容——这不是"路径探测"层面的
    硬编码，而是这个函数天生就是为 `OrderCancellationController` 这一个具体端点写的对账检查。要泛化成
    "对任意目标项目的任意 OpenAPI 文件与任意 Spring controller 做路径/方法一致性交叉校验"，需要真正解析
    OpenAPI YAML 的 `paths` 结构与 Java 侧 `@RequestMapping`/`@GetMapping`/`@PostMapping`/`@PutMapping`/
    `@DeleteMapping` 注解并做双向比对——这是一个轻量 OpenAPI-Controller 契约 linter 的范畴，而不是简单的
    路径探测泛化，复杂度与 `gates.mjs` 那次修复不是同一量级
  - codegraph 报告两函数各自"1 caller"（均指向 `post-write.mjs`），grep 交叉核实后确认 `verify.mjs:40-41` 同样
    无条件调用这两个函数（codegraph 对该文件的解构导入存在同样的漏报模式，与上次 `gate-tightening-skeleton`
    change 探索时观察到的现象一致）
  - 两函数均已有 `existsSync` 自我保护，对当前不存在该硬编码路径的项目（包括绝大多数真实目标项目）安全返回
    `[]`，不会误报，但也意味着**从未真正校验任何东西**
  - `reference-service` 自身还有更完整的 OpenAPI 契约验证脚本：
    `harness/plugin/runtime/verify-scripts/validate-openapi.sh`、
    `harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`（`CLAUDE.md` 提到的"轻量脚本"），
    需要在 design 阶段确认这两个 shell 脚本与 `checks.mjs` 里的同名 JS 函数是否是同一套逻辑的两份实现，还是
    分工不同（避免本次改动只改了 JS 版本、遗漏 shell 版本，或者反之）
- Fallback Reason: 无需 fallback，codegraph + grep 交叉验证已覆盖全部相关符号。

## Context7 / Documentation Attempt

- Library Name: 不适用（纯仓库内部 runtime 校验逻辑，本身不涉及具体 OpenAPI parser 库的选型决策——如果后续
  真的要实现完整 YAML/Java 解析，可能需要查 OpenAPI parser 相关文档，但这属于 Decisions Required 里较大
  那个选项的范畴，本轮 discovery 阶段不需要）
- Fallback Reason: 跳过——本轮 discovery 只需要确认现状与泛化成本差异，不涉及具体实现库选型。

## Impact Summary

- API: no（不改变 harness 自身对外 API；也不改变 reference-service 的业务 API）
- Data: no
- Architecture: no（不改变 Java 四层架构）
- Rule: yes（改变 `.claude/rules/60-api-contract.md` 描述的"当前 MVP 过渡说明"里"现有 hook 仍以轻量 marker
  检查为主，这不是最终门禁能力"这一表述的现实基础）

## Unknowns

- `validateControllerConsistency` 是否要在本轮就做"真正的 OpenAPI-Controller 交叉校验器"，还是本轮只做
  `validateOpenApiLight` 的泛化 + 把 `validateControllerConsistency` 明确重新定位/改名为
  "reference-service 自身回归检查"（不再暗示是通用能力），把完整泛化留给独立的、更大的后续 change
- `verify-scripts/validate-openapi.sh`/`validate-controller-consistency.sh` 与 `checks.mjs` 里同名 JS 函数
  的关系需要在 design 阶段读源码确认

## Decisions Required

- 本轮范围：只泛化 `validateOpenApiLight`（低成本，与 `gates.mjs` 同量级），还是连
  `validateControllerConsistency` 一起做完整泛化（高成本，接近独立 L2/L3 initiative）？（将作为 clarify 问题
  呈现给用户）

## Confidence

高。已通过 codegraph_explore + grep 交叉验证确认两个函数的调用点、现状行为、以及二者泛化成本的质的差异。
