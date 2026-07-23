# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer
- 本阶段交接物：`design.md`

## Current-State Evidence

见 `harness/changes/openapi-contract-check-generalization/evidence/`：

- `validateOpenApiLight`（`checks.mjs:441-450`）硬编码 `reference-service/openapi/order-service.yaml`，检查
  `openapi:`/`paths:`/`components:` 三个顶层 key（纯结构校验，无业务语义）
- `validateControllerConsistency`（`checks.mjs:452-464`）硬编码 `OrderCancellationController.java` 与其
  `/api/orders/{orderId}/cancel` 路径、`@RequestMapping("/api/orders")`/`@PostMapping("/{orderId}/cancel")`
  注解内容（业务语义强绑定，非通用路径探测可解决）
- 调用点：`post-write.mjs:51-52`、`verify.mjs:40-41`（codegraph 对 `verify.mjs` 的解构导入漏报，已用 grep 交叉确认）
- 额外发现：`verify-scripts/validate-openapi.sh`、`verify-scripts/validate-controller-consistency.sh` 是同一
  硬编码逻辑的 bash 实现，被 `verify-scripts/full-verify.sh:10-22` 调用（各自前置 `if [ -f <硬编码路径> ]` 判断，
  与 JS 版本的 `existsSync` 自我保护模式完全对应）
- `full-verify.sh` 本身**未接入任何自动化管线**（非 CI、非 `package.json` scripts、非 `cli.mjs` 命令），仅在
  `CLAUDE.md:81-87` 作为"当前阶段本地验证仍以轻量脚本为主"被文档化，且该文档已如实声明"不得把现有轻量脚本
  误当成完整企业级门禁"——因此 shell 版本的优先级低于 JS 版本（JS 版本挂在 `post-write.mjs` 热路径与
  `cli.mjs verify` 上，每次写操作/验证都会跑；shell 版本只在有人手动执行 `full-verify.sh` 时才跑），但既然
  clarify 已确认纳入范围，仍需同步修复以保持两份实现行为一致，避免"JS 说泛化了、shell 还停留在硬编码"的新漂移
- 全仓 grep 确认无任何测试文件对 `validateOpenApiLight`/`validateControllerConsistency` 的返回值/错误字符串
  格式做断言（"no covering tests found"），改变错误消息格式或函数名不会破坏既有测试

## Scope / Non-goals

范围内：
1. `validateOpenApiLight` 泛化为自动探测任意 `openapi` 目录下的 YAML 文件并逐一做结构校验
2. `validate-openapi.sh` 做同等泛化（bash 版本）
3. `validateControllerConsistency` 改名为 `validateReferenceServiceControllerConsistency`，加注释明确其范围是
   reference-service 自身回归检查，不做业务语义泛化
4. `validate-controller-consistency.sh` 加注释明确同样的范围限定（不改文件名，见 Rejected Options）
5. `.claude/rules/60-api-contract.md`"当前 MVP 过渡说明"章节表述更新，反映 OpenAPI 结构检查已泛化、
   controller 一致性检查仍是 demo 自检这一现实
6. `CLAUDE.md` 第 84-85 行对这两个脚本的描述同步更新

非目标：见 `change.md` 非目标章节（不实现通用 OpenAPI-Controller 交叉校验器；不改 `gates.mjs` 已完成的泛化；
不改 reference-service 业务代码）

## Options Considered

### Option A：`validateOpenApiLight` 独立实现一套新的目录扫描逻辑
与 `gates.mjs` 的 `GOVERNANCE_BLOCKLIST` 各自维护一份黑名单，未来两处黑名单可能各自演化、产生不一致。

### Option B：`validateOpenApiLight` 复用 `gates.mjs` 已导出的黑名单常量，新写一个目录遍历函数
共享同一份生成物/依赖目录黑名单定义，避免重蹈"两处硬编码列表各自维护、容易漂移"的覆辙
（`gate-tightening-skeleton` design review 已经点出过这个反模式一次）。

## Selected Option and Rationale

选择 **Option B**。理由：
- `gates.mjs` 已经有一份维护良好、经过 design review 多轮打磨的黑名单（`target`/`build`/`node_modules`/`.git`/
  `dist`/`out`），没有理由在 `checks.mjs` 里重新发明一份
- `validateOpenApiLight` 与 `gates.mjs` 的探测目标不同（前者需要枚举**全部**匹配目录做整体扫描，后者只需要
  判断**单个**目标路径是否匹配），因此遍历函数本身不能直接复用 `gates.mjs` 的 `detectGovernedKind`（那是
  单路径子序列匹配，不是目录树枚举），但黑名单常量可以共享

## Rejected Options

- 拒绝把 `validate-controller-consistency.sh` 也改名：该脚本文件名被 `full-verify.sh:19` 与 `CLAUDE.md:85`
  按文件名引用，改名会牵连更新这两处，且 `full-verify.sh` 本身未接入自动化管线、改名收益有限，不值得增加
  改动面；只在脚本内部加注释澄清范围即可，与 JS 函数改名的非对称处理已在 Scope 明确记录，不是遗漏

## Affected Layers

- runtime layer：`harness/plugin/runtime/lib/checks.mjs`、`harness/plugin/runtime/lib/gates.mjs`（导出黑名单常量）、
  `harness/plugin/runtime/hooks/post-write.mjs`、`harness/plugin/runtime/verify.mjs`
- verify-scripts layer：`harness/plugin/runtime/verify-scripts/validate-openapi.sh`、
  `harness/plugin/runtime/verify-scripts/validate-controller-consistency.sh`
- rules/docs layer：`.claude/rules/60-api-contract.md`、`CLAUDE.md`

## Interface Contract
- External API: 不适用
- Internal service contract:
  - `gates.mjs` 新增导出 `GOVERNANCE_BLOCKLIST`（把现有模块内 `const GOVERNANCE_BLOCKLIST = new Set([...])`
    加 `export`，不改变其值）
  - `checks.mjs` 新增内部函数 `findOpenApiYamlFiles(root): string[]`（不导出，仅供 `validateOpenApiLight` 使用）
  - `validateOpenApiLight(root): string[]` 签名不变，行为从"检查 1 个硬编码文件"变为"检查全部探测到的文件"
  - `validateControllerConsistency` **重命名**为 `validateReferenceServiceControllerConsistency(root): string[]`，
    签名（参数、返回值类型）不变，仅函数名变化，硬编码路径/业务语义逻辑本身不变
- Compatibility / caller impact:
  - `post-write.mjs`/`verify.mjs` 的 import 与调用点需要同步改名（2 处文件、各 1 行 import + 1 行调用）
  - 无其他文件依赖这两个函数名（已 grep 确认），改名不会有遗漏调用点

## Data / SQL Design
不适用。

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
不适用（纯 harness runtime governance 层改动，不涉及 Java 四层架构）。

## Flow / State Changes

`findOpenApiYamlFiles(root)` 算法：
1. 从 `root` 开始做有界深度优先遍历（深度上限 12，纯粹作为极端场景/符号链接环的安全网，非性能考量——本函数
   跑在 `post-write.mjs`/`verify.mjs` 的整体校验阶段，不是逐次 Write/Edit 的热路径，性能不敏感）
2. 遍历时跳过 `GOVERNANCE_BLOCKLIST` 中的目录名（`target`/`build`/`node_modules`/`.git`/`dist`/`out`）
3. 命中目录名字面量为 `openapi` 时：收集该目录**直接下级**（不递归其子目录）里扩展名为 `.yaml`/`.yml` 的文件，
   加入结果列表；**同时继续**向下遍历该目录之外的兄弟/父级路径下的其他目录（多模块场景可能有多个 `openapi` 目录）
4. 边界说明：
   - 若 `root` 自身的最后一个路径段就叫 `openapi`，则把 `root` 本身按命中的 `openapi` 目录处理，收集其直接下级 YAML 文件
   - 若遇到符号链接目录：不跟随（依赖 `fs.readdirSync(..., { withFileTypes: true })` + `Dirent.isDirectory()` 的默认行为，
     符号链接不会被当作普通目录继续递归），这样不会因 `openapi -> ..` 一类链接形成环；深度上限 12 作为第二层兜底
5. 返回收集到的全部文件绝对路径列表

`validateOpenApiLight` 改为对 `findOpenApiYamlFiles(root)` 返回的每个文件逐一做原有的 3-pattern 结构校验，
错误消息格式从 `openapi:${pattern}` 改为 `openapi:${relPath}:${pattern}`（新增相对路径前缀，便于多文件场景下
定位是哪个文件的问题；已确认无测试依赖旧格式）。

`validate-openapi.sh` 对应改为**先 `cd "$ROOT"`，再对相对路径 `.` 做 `find`**（回应 design review block：原方案
`find "$ROOT" -type d -name openapi -not -path '*/target/*' ...` 是对**含 `$ROOT` 绝对路径前缀**的完整路径做
`-not -path` 子串匹配——若仓库被 checkout 到路径中含 `build`/`target`/`dist`/`out`/`node_modules`/`.git` 同名
目录段的位置（CI 工作区路径常见），会把该路径前缀误判为生成物目录，导致其下全部合法 `openapi` 目录被静默排除，
与 JS 侧 `gates.mjs` 先 `path.relative(root, target)` 再只检查相对路径 segments 的做法不等价，已实测复现此
缺陷）。修正后的方案：
```bash
cd "$ROOT" && find . -type d \( -name target -o -name build -o -name node_modules -o -name .git -o -name dist -o -name out \) -prune -o -type d -name openapi -print
```
用 `-prune` 在遍历到黑名单目录时直接剪掉整棵子树（不再进入其内部），而不是遍历完再用 `-not -path` 对完整路径
做字符串排除——这样黑名单判断只作用于相对 `$ROOT` 之后的路径片段，语义上才真正对应 JS 侧"只检查祖先段"的效果，
且不受 `$ROOT` 自身绝对路径内容影响。对 `find` 输出的每个 `openapi` 目录，枚举其下 `*.yaml`/`*.yml` 文件逐一跑
原有 3 条 `grep` pattern 检查。

`validateReferenceServiceControllerConsistency`（原 `validateControllerConsistency`）逻辑完全不变，只改函数名，
新增函数顶部注释：
```js
// 注意：这是 reference-service 自身的 demo 回归检查（硬编码 OrderCancellationController 的路径/注解语义），
// 不是通用的任意项目 OpenAPI-Controller 交叉一致性校验器。真正的通用校验器需要解析任意 OpenAPI `paths`
// 与任意 Spring `@RequestMapping`/`@GetMapping`/... 注解并做双向比对，是独立的、更大的后续 initiative
// （见 PROGRESS.md 技术债）。
```
`validate-controller-consistency.sh` 顶部新增等价的 shell 注释，并额外点明这是**刻意**与 JS 函数改名不同步的决定（文件名保持不变只是为了避免牵连 `full-verify.sh:19` 与 `CLAUDE.md:85` 的文件名引用，不是遗漏重构）。

## Cross-layer Type and Mapper Matrix
不适用。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
`findOpenApiYamlFiles` 对 `fs.readdirSync` 可能抛出的异常（权限问题等极端场景）用 `try { } catch { return; }`
静默跳过该目录，不中断整体扫描——与 `gates.mjs`/既有 `checks.mjs` 函数对文件系统异常的处理风格一致（防御性、
不因单点异常拖垮整个 `post-write.mjs`/`verify.mjs`）。

## Transaction Boundaries
不适用。

## Testing Strategy
- Unit: 新增 `harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs`，直接 `import`
  `validateOpenApiLight`（无需 spawn 子进程，纯函数级）：
  1. 临时目录下 `reference-service/openapi/order-service.yaml`（向后兼容基线）→ 检测到并校验通过
  2. 临时目录下任意模块名 `foo-service/openapi/spec.yaml`（非 reference-service 命名）→ 检测到（**核心修复
     验证**）
  3. 多模块场景：`module-a/openapi/a.yaml` + `module-b/openapi/b.yaml` 同时存在 → 两个文件都被检测到，
     各自独立报告结构错误（如故意让其中一个缺 `components:`，断言错误消息只包含该文件、不含另一个）
  4. 生成物目录黑名单：`some-module/target/generated/openapi/spec.yaml` → 不被检测到（复用 `gates.mjs` 黑名单）
  5. 完全没有任何 `openapi` 目录 → 返回空数组，不报错
- Integration: 新增 `harness/plugin/runtime/test/post-write-openapi-scan-smoke.mjs`，真实 spawn `post-write.mjs`
  子进程，在非 `reference-service` 命名的临时项目里放一个结构不完整的 OpenAPI YAML（缺 `paths:`），断言
  `post-write.mjs` 的 stdout/stderr 报出对应错误（验证泛化后的检测确实通过 hook 生效，而不仅是单元函数层面）
- Backend API E2E: 不适用
- RED path:
  - Command: `node harness/plugin/runtime/test/checks-openapi-scan-unit-smoke.mjs red`
  - Expected failure: 用例 2/3（非 reference-service 命名的 openapi 目录）在当前硬编码实现下检测不到，断言失败
- 回归（改名不破坏调用方）：
  - `node harness/plugin/runtime/cli.mjs verify`（验证 `verify.mjs` 改名后调用点仍正确工作）
  - 手动在临时目录里 spawn `post-write.mjs`，确认改名后 `validateReferenceServiceControllerConsistency` 仍然
    对 `reference-service` 自身生效（向后兼容，逻辑未变只是改名）
- shell 脚本回归：手动执行改造后的 `validate-openapi.sh`，分别针对 `reference-service/openapi/` 与一个临时
  构造的非 reference-service 路径下的 `openapi/` 目录验证，确认 bash 版本与 JS 版本行为一致

## Rollout and Rollback
- 改动范围是 harness 自身 runtime + verify-scripts + rules 文档，随下次 `cli.mjs verify`/CI 运行即生效
- 回滚：还原 `checks.mjs`/`gates.mjs`/`post-write.mjs`/`verify.mjs`/两个 `.sh` 脚本/`60-api-contract.md`/
  `CLAUDE.md` 到修改前版本即可，无状态迁移

## Risks
1. **多 `openapi` 目录场景下的性能**：多模块超大仓库理论上可能有很多 `openapi` 目录，但已在 Flow 中说明本函数
   非热路径，可接受
2. **改名遗漏调用点**：已 grep 确认全仓无其他文件引用 `validateControllerConsistency` 这个名字，改名风险低
3. **shell/JS 两份实现语义漂移**：日后若只改了 JS 忘了同步改 shell（或反之），会重新引入不一致。缓解：
   本次在两处都加了"发现同类问题需要同时检查另一侧实现"性质的注释，但**不**新增自动化机制强制两者语义一致
   （超出本轮 L2 范围，若未来需要，属于独立的"消除 JS/shell 双实现"重构议题）

## Open Questions
- 是否应该彻底废弃 shell 版本的 `verify-scripts/*.sh`，统一到 `cli.mjs verify` 一条路径，消除双实现漂移风险？
  `full-verify.sh` 当前未接入任何自动化管线，废弃候选，但 `CLAUDE.md` 已经文档化其存在，废弃需要单独决策，
  记入 PROGRESS.md，本轮不处理

## Design Self-Review
- 覆盖 clarify 决策：✅（只泛化结构检查，诚实重新定位 controller consistency）
- 向后兼容：✅（reference-service 自身两个检查行为不变，只是其中一个函数改名）
- 范围克制：✅（不做通用交叉校验器；shell 脚本不改文件名，只加注释）

## Approval
待 `design-reviewer` 消费。
