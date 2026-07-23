# Validation

## Role Ownership
- 主导角色：Quality Engineer 视角
- 参与角色：Fullstack Developer / Principal Architect / Human User（最终业务验收）
- 本阶段交接物：完成声明的验证与验收收口 `validation.md`

## Artifact Digest
不适用（本 change 不涉及 Java 业务代码，改动范围为 harness runtime JS / shell / rules 文档）。

## Commands Executed

RED（Task 1，先写两个 smoke 后确认修前失败）：
```bash
node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs red
# -> Red precondition holds: validateOpenApiLight still only sees the hardcoded reference-service path.

node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs red
# -> Red precondition holds: post-write.mjs still silently skips non-reference-service OpenAPI files.
```

Task 2 GREEN（JS 侧泛化与改名）：
```bash
node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs green
# -> Green checks-openapi-scan-unit-smoke passed.

node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs green
# -> Green post-write-openapi-scan-smoke passed.

node harness/plugin/runtime/cli.mjs verify
# -> OK contract checks passed.
```

Task 3 shell RED/GREEN（design-reviewer 上一轮 blocker 的核心场景，按 tasks.md 固定命令实测）：
```bash
TMP="$(mktemp -d)"
mkdir -p "$TMP/build/reference-service/openapi"
cat > "$TMP/build/reference-service/openapi/order-service.yaml" <<'YAML'
openapi: 3.0.0
paths: {}
components: {}
YAML
find "$TMP/build/reference-service" -type d -name openapi -not -path '*/target/*' -not -path '*/build/*' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/out/*'
# -> RED: 输出为空（旧绝对路径 -not -path 方案误伤）

cd "$TMP/build/reference-service" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
# -> GREEN: 输出 ./openapi

mkdir -p "$TMP/foo-service/target/generated/openapi"
cat > "$TMP/foo-service/target/generated/openapi/spec.yaml" <<'YAML'
openapi: 3.0.0
paths: {}
components: {}
YAML
cd "$TMP/foo-service" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
# -> GREEN: 不出现 ./target/generated/openapi
rm -rf "$TMP"
```

Task 3/4/5 最终回归：
```bash
bash harness/plugin/runtime/verify-scripts/validate-openapi.sh
# -> OpenAPI structure validation passed.

bash harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh
# -> Controller/OpenAPI consistency validation passed.

node harness/plugin/runtime/cli.mjs verify
# -> OK contract checks passed.
```

## Clarify / Requirements Confirmation
- 用户已确认本轮范围：**只泛化结构检查**（`validateOpenApiLight` + `validate-openapi.sh`），
  `validateControllerConsistency` / `validate-controller-consistency.sh` 只做诚实重新定位，不实现通用 OpenAPI-Controller 交叉校验器

## Unit Tests
- `checks-openapi-scan-unit-smoke.mjs`
  - 覆盖 `reference-service` 向后兼容
  - 覆盖非 `reference-service` 路径（核心修复点）
  - 覆盖多模块场景下只对坏文件报错且错误消息含相对路径
  - 覆盖生成物目录黑名单排除
  - 覆盖无 `openapi` 目录时返回空数组

## Unit Coverage
未测量行覆盖率百分比。本仓库当前对 Node.js runtime `.mjs` 脚本未接入覆盖率门禁；本轮通过 smoke 级用例覆盖关键分支与边界场景。

## Architecture Tests
不适用（不涉及 Java 四层架构）。

## Integration Tests
- `post-write-openapi-scan-smoke.mjs`：真实 `spawnSync` 触发 `post-write.mjs`，验证非 `reference-service` 命名路径下的 OpenAPI 结构错误会被 hook 拦截
- `cli.mjs verify`：验证 `verify.mjs` 改名后的调用链仍工作
- shell RED/GREEN：真实复现并验证 `$ROOT` 自身路径含 `build` 词段时的旧误伤问题与新 `find . ... -prune` 修复

## Backend API E2E
不适用。

## OpenAPI Contract
- `validateOpenApiLight` 已泛化到任意 `openapi/` 目录下的 YAML 基础结构检查
- `validateReferenceServiceControllerConsistency`（原 `validateControllerConsistency`）仍只用于 `reference-service` demo 自身的 controller/OpenAPI 轻量回归
- shell 侧 `validate-openapi.sh` / `validate-controller-consistency.sh` 与上述定位保持一致

## Google Java Style
不适用（不改 Java 源码）。

## Review Verdicts
- `design-reviewer`：`pass`（`reviews/design-reviewer.json`，2026-07-22，经历一轮 blocker 修正：shell 侧 `find "$ROOT" ... -not -path` 误伤改为 `cd "$ROOT" && find . ... -prune`）
- `plan-critic`：`pass`（`reviews/plan-critic.json`，2026-07-22，一轮修正：hook smoke 夹具机械固定、shell RED/GREEN 命令具体化）
- `verification-reviewer`：待本轮 verify 阶段消费

## Stage Gate Summary
- clarify: 完成（用户确认只泛化结构检查，不做通用 controller/OpenAPI linter）
- design: `design-reviewer` pass
- plan: `plan-critic` pass
- tdd: Task 1-5 已完成 RED→GREEN→REFACTOR（JS smoke、hook smoke、shell 场景、文档更新、全量回归）
- verify: 待 `verification-reviewer` 消费

## Skipped Checks
- 未实现真正的通用 OpenAPI-Controller 交叉解析器（明确排除在本轮范围外）
- 未废弃 shell 版 verify-scripts 双实现（记为后续潜在重构议题）

## Failures and Retries
- 无代码层反复返工；design/plan 阶段各有一轮 reviewer block 并在进入 TDD 前修正：
  - design-reviewer 抓到 shell 绝对路径 `-not -path` 误伤问题
  - plan-critic 抓到 hook smoke 夹具与 shell RED/GREEN 命令不够机械化的问题

## Final Verdict
本 change 已按确认范围完成：OpenAPI 基础结构检查（JS + shell）已泛化到任意 `openapi/` 目录；controller consistency 检查已诚实重新定位为 `reference-service` 自身回归检查；hook/verify/shell 三个执行面全部有 GREEN 证据。

> **时序说明（回应 verification-reviewer 的 block）**：上方记录的 `node harness/plugin/runtime/cli.mjs verify -> OK contract checks passed.` 采集于本 change 被写成 `REVIEWED` 之前；一旦 `state=REVIEWED`，仓库自己的门禁（`checks.mjs`）要求 `validation.status=fresh`，否则会如实报 `REVIEWED requires fresh validation`。因此本文件写定后，收尾动作是：执行 `node harness/plugin/runtime/cli.mjs lifecycle validated openapi-contract-check-generalization` 计算 fresh digest，再**不修改本 change 目录下任何文件**，随后重新跑并确认下列最终命令：
> - `node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs green`
> - `node harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs green`
> - `bash harness/plugin/runtime/verify-scripts/validate-openapi.sh`
> - `bash harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`
> - `node harness/plugin/runtime/cli.mjs verify`
>
> 只有最后一条也重新回到 `OK contract checks passed.`，本 change 才能进入 `VALIDATED`。
