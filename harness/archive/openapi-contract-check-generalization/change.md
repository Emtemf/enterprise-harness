# Change

## 原始需求

用户在全局审视本项目时发现的最初问题（`gates.mjs` 硬编码只保护 `reference-service` demo）已经修复。
`gate-tightening-skeleton` change 的 design.md Open Questions 明确记录了同类问题：`checks.mjs` 的
`validateOpenApiLight()`/`validateControllerConsistency()` 也硬编码只识别 `reference-service/openapi/order-service.yaml`
与 `OrderCancellationController.java`，对真实目标项目静默 no-op，OpenAPI 契约漂移检测从不对任意真实安装的
目标项目生效。用户要求本轮修复这个技术债。探索阶段额外发现 2 个 shell 脚本
（`verify-scripts/validate-openapi.sh`/`validate-controller-consistency.sh`）与这两个 JS 函数是完全相同的
硬编码逻辑，一并纳入范围。

## 业务结果

- `validateOpenApiLight`（及其 shell 版本 `validate-openapi.sh`）泛化为自动探测目标项目里任意 `openapi` 目录下的
  YAML 文件（复用 `gates.mjs` 已建立的 `openapi` 目录约定与生成物黑名单排除逻辑），对找到的每个文件做同样的
  `openapi:`/`paths:`/`components:` 顶层 key 结构校验。修复后，OpenAPI 基础结构校验对任意真实安装的目标项目
  也能生效，不再只保护 `reference-service` demo。
- `validateControllerConsistency`（及其 shell 版本 `validate-controller-consistency.sh`）**不做完整泛化**，
  诚实重新定位：函数改名为体现其真实范围的名字（如 `validateReferenceServiceGoldenSampleConsistency`），
  并在代码注释、`.claude/rules/60-api-contract.md` 相关表述里明确说明这是 `reference-service` 自身的回归检查，
  不是通用的任意项目 OpenAPI-Controller 交叉一致性校验器；真正的通用交叉校验器留给独立的后续 L2/L3 initiative
  （已记入 PROGRESS.md 技术债，关联 Java golden sample 路线图）。

## 非目标

- 不实现真正的通用 OpenAPI YAML `paths` 结构解析 + 任意 Spring controller 注解交叉比对（这是独立的、更大的
  L2/L3 initiative，本轮明确排除）
- 不改变 `gates.mjs`/`checks.mjs` 里已经泛化过的 `isGovernedTarget`/`requiredGateForTarget`/`hasChangeTracking`
- 不改变 `reference-service` 业务代码本身
- 不处理 `gate-hardening-red-task-smoke.mjs` 硬编码 `gate-hardening-semantics` 的技术债（另一条独立记录的债，
  与本次主题不同）

## 归属服务 / 模块 / 业务域

- scope: enterprise harness governance / OpenAPI contract check
- owning module:
  - `harness/plugin/runtime/lib/checks.mjs`
  - `harness/plugin/runtime/verify-scripts/validate-openapi.sh`
  - `harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`
  - `.claude/rules/60-api-contract.md`（表述更新）
- business domain: harness runtime governance 的 OpenAPI 契约漂移检测能力

## 初步路由

- request shape: modify
- candidate tier: L2
- hard signals: rule_change（改变 `.claude/rules/60-api-contract.md` 的现实基础表述），architecture_change 待定
- reason: 涉及多个文件（JS + shell + rules 文档）的协同修改，且需要明确"泛化 vs 诚实重新定位"的架构决策，
  超出 L1 单文件局部修复的范畴

## 最小探索证据

见 `harness/changes/openapi-contract-check-generalization/evidence/openapi-contract-generalization-exploration.md`：
- 确认 `validateOpenApiLight`（`checks.mjs:441-450`）是纯结构校验，无业务语义，可比照 `gates.mjs` 的路径探测
  方式泛化
- 确认 `validateControllerConsistency`（`checks.mjs:452-464`）硬编码了 `OrderCancellationController` 特定的
  路径字符串与注解内容，真正泛化需要实现 OpenAPI-Controller 交叉解析器，成本量级与 `gates.mjs` 修复不同
- 额外发现并读取 `verify-scripts/validate-openapi.sh`/`validate-controller-consistency.sh` 两个 shell 脚本，
  确认与 JS 函数逻辑完全一致（同样硬编码路径与 pattern），是同一问题的第二份实现，需要一并处理
- codegraph 对 `verify.mjs` 的解构导入存在漏报（与上次探索一致的已知现象），已用 grep 交叉确认
  `verify.mjs:40-41` 与 `post-write.mjs:51-52` 都无条件调用这两个函数

## 最终路由

- final tier: L2
- owning scope: harness runtime governance / OpenAPI contract check
- next focus: design 阶段明确 `validateOpenApiLight` 的具体探测算法（复用 `gates.mjs` 逻辑还是独立实现）、
  `validateControllerConsistency` 的改名方案与 rules 文档更新范围

## 影响矩阵

- API: no
- data: no
- architecture: no
- rule: yes

## 需要确认的决策（clarify 已确认）

- 范围：**只泛化结构检查**（`validateOpenApiLight` + `validate-openapi.sh`），**诚实重新定位**
  `validateControllerConsistency`/`validate-controller-consistency.sh` 为 reference-service 自身回归检查，
  不做完整的通用 OpenAPI-Controller 交叉校验器（后者留给独立后续 change）

## 假设

- `validateOpenApiLight` 泛化后的探测算法可以复用/参考 `gates.mjs` 已建立的 `openapi` 目录约定与生成物黑名单
  排除逻辑，保持行为一致性，不需要重新设计一套探测规则
- 目标项目里的 OpenAPI YAML 文件数量通常较少（通常 1 个，多模块场景下可能有多个），全量目录扫描的性能成本
  可接受（不同于 `gates.mjs` 是逐次 Write/Edit 触发的热路径，这里是 `post-write.mjs`/`verify.mjs` 的整体校验，
  扫描频率远低于单文件写入频率）

## Waiver

不适用。

## Requirement Review

待 `requirement-reviewer` 消费。
