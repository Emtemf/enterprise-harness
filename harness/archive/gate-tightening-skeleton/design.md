# Design

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer / Human User（已在 clarify 阶段确认执行范围）
- 本阶段交接物：提供给开发（TDD 实现）与测试（RED/GREEN 用例设计）消费的 `design.md`

## Current-State Evidence

见 `harness/changes/gate-tightening-skeleton/evidence/gates-exploration.md`（codegraph_explore + codegraph_impact + codegraph_callers 交叉验证）。核心事实：

- `isGovernedTarget()` / `requiredGateForTarget()`（`gates.mjs:17-37`）硬编码 `<root>/reference-service/{src/main,src/test,openapi}` 三个绝对目录，`root = process.cwd()`（真实目标项目的根目录）。
- 两处调用点（`pre-write.mjs:43`、`post-write.mjs:25`）均无覆盖测试（codegraph 标注 "no covering tests found"）。
- `post-write.mjs:10-12` 在 `isHarnessManaged(root)=false` 时**整体提前 `process.exit(0)`**，包括 stdin 读取与"标记 validation 为 stale"的逻辑，不仅仅是结构校验部分。
- `isHarnessManaged(root)` = `harness/changes` **且** `harness/specs` 同时存在；但 `start-change.mjs` 只创建 `harness/changes/<id>/`，不创建 `harness/specs/`——按当前记录的 onboarding 路径（README「安装后开始使用」章节），真实目标项目走完 `start-change` 后仍然 `isHarnessManaged=false`。
- `validateArtifactStates` / `validateReviewVerdicts` / `validateChangeEvidence`（`checks.mjs:195/375/408`）在目标项目缺少 `harness/changes` 时均能安全 no-op（`validateArtifactStates`/`validateChangeEvidence` 是顶层 `if (!fs.existsSync(changesDir)) return [];` 早退；`validateReviewVerdicts` 没有这种早退语句，而是无条件读取 `harness/templates/review-verdict.json` 并调用 `readReviewVerdictFile`，该函数内部 `if (!fs.existsSync(file)) return null;` 静默跳过，且函数体内对 `changesDir` 的两处遍历也各自有 `if (fs.existsSync(changesDir))` 保护），三者均是**通用**逻辑，不依赖本仓库特有文件，效果上对无 `harness/changes` 的项目都安全无害。
- `harness/plugin/runtime/verify.mjs`（`cli.mjs verify` 的驱动脚本）与 `post-write.mjs` 是两条独立调用链，但都会无条件调用同一批 `validate*` 函数；`verify.mjs` 本身面向的是已 `cd` 进具体仓库执行 `cli.mjs verify` 的场景（通常就是 harness 自身仓库或已 onboarding 的目标项目），其调用方式不经过 `isHarnessManaged`/`hasChangeTracking` 判定，本次改动不需要、也不应该触碰 `verify.mjs`。
- `validateStructure`（`checks.mjs:117`，消费 `requiredPaths()`）检查的是本仓库自己的固定文件清单（`harness/bin/*.sh`、`harness/plugin/manifest.json`、`.claude/rules/00-workflow.md` 等），是**仓库自检专用**逻辑，不适合套用到任意目标项目。
- `isHarnessManaged` 另有一处调用方 `session-start.mjs:49`（codegraph 漏报，grep 交叉确认），用于门控启动时的进度展示；本次不改 `isHarnessManaged` 的定义本身，避免影响 session-start 行为。
- `validateOpenApiLight` / `validateControllerConsistency`（`checks.mjs:434/445`）同样硬编码 `reference-service/openapi/order-service.yaml` 等具体文件，但各自已有 `existsSync` 自我保护（对目标项目天然 no-op，不会误报）。**本轮不改这两个函数**——clarify 已明确范围只覆盖 `isGovernedTarget`/`requiredGateForTarget` 与 `post-write.mjs` 的 `isHarnessManaged` 判定，扩大到这两个函数属于范围外改动，记为 Open Question 留给后续 change。

## Scope / Non-goals

范围内：
1. `gates.mjs`：`isGovernedTarget` / `requiredGateForTarget` 改为路径片段（path-segment）自动探测，替代硬编码目录列表
2. `pre-write.mjs`：新增"`.java` 文件写入但未命中任何受治理约定"时的一次性 stderr 提醒（不 BLOCK）
3. `post-write.mjs`：拆分 `isHarnessManaged` 的门控职责——`validateStructure` 继续用 `isHarnessManaged`；`validateArtifactStates`/`validateReviewVerdicts`/`validateChangeEvidence` 与"标记 validation stale"逻辑改用新的、更宽松的 `hasChangeTracking(root)` 判定
4. 新增单测/回归测试：真实 spawn hook 子进程触发拦截，而非字符串匹配 `SKILL.md` 文本

非目标（沿用 clarify 已确认的排除项）：
- 不新增显式手动配置受治理路径的 schema 字段
- 不扩展非 Java 技术栈（如 Kotlin `src/main/kotlin`）的探测
- 不改变 `designApproved`/`redVerified` 的 gate 语义本身
- 不改 `validateOpenApiLight`/`validateControllerConsistency`（范围外，记入 Open Questions）
- 不改 `isHarnessManaged` 函数定义本身（避免影响 `session-start.mjs`）

## Options Considered

### Option A：静态目录列表 → 换成更长的静态列表（如追加 `src/main/java`、`api/`、`contract/` 等常见目录名，仍是绝对路径拼接）
简单，但换汤不换药：任何不在列表里的项目结构依旧探测不到；且需要不断维护列表。

### Option B：基于路径片段（path-segment）子序列匹配，运行时对 `target` 相对 `root` 的路径做分段比较
不依赖目标项目的顶层目录名，天然支持多模块 Maven/Gradle 布局（`any-module/src/main/java/...` 都能命中），且是 O(路径长度) 的纯字符串操作，无需文件系统扫描，可安全跑在 `pre-write`/`post-write` 热路径上。

### Option C：改为运行时递归扫描项目目录，动态发现所有 `src/main/java` 风格目录并缓存
覆盖面最广（可以顺带做"探测失败"判定），但需要引入扫描 + 缓存失效机制（每次 hook 调用都是独立进程，缓存需要落盘），复杂度显著上升，且违反 `coding-style.md` 的"不为假设中的未来需求设计"原则。

## Selected Option and Rationale

选择 **Option B**，并在其基础上做一个轻量补充解决"探测失败提醒"（而不是引入 Option C 的落盘扫描缓存）：

- `isGovernedTarget`/`requiredGateForTarget` 用路径片段子序列匹配（`['src','main','java']`、`['src','test','java']`、单段 `'openapi'`），对 `target` 相对 `root` 的分段做匹配。这是纯字符串操作，天然支持多模块、无需扫描、可保持热路径性能。
- 对 clarify 确认的"探测失败提醒但不拦截"，**不做全项目扫描**，而是收窄触发条件为：当被写入的文件本身以 `.java` 结尾、但未命中任何受治理约定时，`pre-write.mjs` 输出一条 stderr 提醒。这个条件本身是 O(1)（只是扩展名判断 + 已有的路径片段匹配复用），不需要额外扫描或缓存，且精确对应"用户正在写 Java 源码，但门禁认不出这个目录"的真实风险场景。

## Rejected Options

- 拒绝 Option A：治标不治本，仍是硬编码列表，只是从 1 个目录名换成 N 个，可预见未来还会有第 N+1 个项目结构不匹配。
- 拒绝 Option C 的全量扫描 + 缓存：命中率略高于 Option B 的收窄触发条件，但引入的落盘缓存失效、跨进程状态一致性问题，与本次 clarify 明确"不做显式配置项"（即保持简单）的决策方向相悖；且性能/复杂度成本不匹配当前问题的严重度（当前是"完全不生效"，Option B 已经把问题从 0% 覆盖修到"标准 Maven/Gradle 布局下 100% 覆盖 + 非标准布局下有提醒"，边际收益递减）。

## Affected Layers

- runtime layer：`harness/plugin/runtime/lib/gates.mjs`、`harness/plugin/runtime/lib/checks.mjs`（新增 `hasChangeTracking`）、`harness/plugin/runtime/hooks/pre-write.mjs`、`harness/plugin/runtime/hooks/post-write.mjs`
- test layer：新增 `harness/plugin/runtime/test/gates-governed-target.smoke.mjs`（暂定命名，实现时可调整）
- 不涉及 Java 业务分层（interfaces/application/domain/infrastructure）——本 change 是 harness 自身治理工具的修复，不改 `reference-service` 业务代码

## Interface Contract
- External API: 不适用（无对外 HTTP API 变化）
- Internal service contract:
  - `isGovernedTarget(root, target): string | null`——**签名与既有语义保持不变**（返回受治理目录的绝对路径或 `null`），调用方 `pre-write.mjs`/`post-write.mjs` 现有的 truthy 判断逻辑不需要改动
  - `requiredGateForTarget(root, target): { needsDesignApproved: boolean, needsRedVerified: boolean } | null`——签名不变
  - 新增内部（不导出）辅助函数 `detectGovernedKind(root, target): { kind: 'main'|'test'|'openapi', dir: string } | null`，供 `isGovernedTarget` 与 `requiredGateForTarget` 共用同一份探测逻辑，避免重蹈"两处硬编码列表各自维护、容易漂移"的覆辙（当前代码已经是这个反模式：`isGovernedTarget` 和 `requiredGateForTarget` 各自定义了一份几乎相同的目录列表）
  - 新增 `checks.mjs` 导出函数 `hasChangeTracking(root): boolean`，仅检查 `harness/changes` 是否存在（不要求 `harness/specs`）
- Compatibility / caller impact:
  - `pre-write.mjs`/`post-write.mjs` 对 `isGovernedTarget` 的调用点（真值判断）不需要改代码
  - `isHarnessManaged` 函数本身不变，`session-start.mjs` 行为不受影响
  - `reference-service/{src/main,src/test,openapi}` 继续被新逻辑覆盖（回归测试验证）

## Data / SQL Design
不适用。本 change 不涉及业务数据/持久化结构。

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
- Layer ownership：本 change 完全落在 harness runtime governance 层（`harness/plugin/runtime/`），不触碰 Java 四层架构
- Object / mapper responsibility：不适用
- Error handling boundary：
  - `pre-write.mjs` 的 BLOCK 路径继续用 `console.error` + `process.exit(2)`（保持现有 Claude Code PreToolUse hook 契约）
  - 新增的".java 文件探测失败"提醒用 `console.error` + 不 `exit(2)`（继续正常 `process.exit(0)`），确保是"提醒不拦截"

## Flow / State Changes

新 `isGovernedTarget` / `requiredGateForTarget` 判定流程：

1. 计算 `rel = path.relative(root, target)`；若 `rel` 以 `..` 开头（目标在项目根之外），直接判定不受治理
2. 按 `path.sep` 切分 `rel` 为 `segments`
3. 在 `segments` 中查找连续子序列 `['src','main','java']`（取最靠左的匹配位置 `i`）；若未找到，查找 `['src','test','java']`；若也未找到，查找单段 `'openapi'`（位置 `j`）；均未找到则返回 `null`
4. **黑名单检查只作用于匹配位置之前的祖先段**（`segments.slice(0, i)` 或 `segments.slice(0, j)`），不检查匹配段本身或其之后的路径（包名）：若祖先段中任意一段命中 `target`/`build`/`node_modules`/`.git`/`dist`/`out`，判定不受治理，返回 `null`
5. 否则按匹配到的类型返回 `kind`：`src/main/java` → `kind='main'`（`needsDesignApproved=true`, `needsRedVerified=true`）；`src/test/java` → `kind='test'`（`needsDesignApproved=true`, `needsRedVerified=false`）；`openapi` → `kind='openapi'`（`needsDesignApproved=true`, `needsRedVerified=true`）

算法决策说明（第一版 design review block + 复审 advisory 的两轮修正结果）：
- 第一版"只查 `segments[0]`"会漏判嵌套生成物目录（如 `order-service/target/generated-sources/annotations/src/main/java/Foo.java`，`target` 不在首段）——这是 design review 的 blocking finding。
- 若改成"`segments` 任意位置命中黑名单即排除"，又会引入反方向风险：业务包名恰好包含黑名单同名词时（如 `src/main/java/com/acme/target/service/Foo.java` 中的包名段 `target`）会被误判为不受治理，导致本该被保护的业务代码静默漏保护——这是复审阶段 reviewer 主动指出的 advisory，对治理工具而言"漏保护"比"误拦截"后果更重。
- 最终方案：黑名单只检查**匹配位置之前的祖先段**（即 `src/main/java`/`src/test/java`/`openapi` 出现之前的路径前缀），不检查匹配段自身或其后的包名路径。这同时解决了两个方向的问题：生成物目录作为祖先段会被排除；包名作为匹配段之后的路径不会被误伤。

`pre-write.mjs` 新增提醒分支（独立于上述判定流程，发生在其之后/之前均可，不影响 BLOCK 逻辑）：
- 若 `target.endsWith('.java')` 且第 7 步返回 `null` → `console.error('REMINDER: ...')`，不影响退出码

`post-write.mjs` 门控拆分：
- `validateStructure(...)` 继续要求 `isHarnessManaged(root)`
- `validateArtifactStates/validateReviewVerdicts/validateChangeEvidence` 与"标记 active change validation 为 stale"逻辑，改为要求 `hasChangeTracking(root)`（`harness/changes` 存在即可）
- `validateOpenApiLight/validateControllerConsistency` 不变（本已自我保护，无条件执行）

## Cross-layer Type and Mapper Matrix
不适用（无 Java 类型/MapStruct 变化）。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
- `detectGovernedKind` 对无法计算相对路径的极端输入（如 `target`/`root` 分属不同盘符，Windows 场景）应返回 `null` 而不是抛异常，避免 hook 本身崩溃导致误伤（`path.relative` 在跨盘符时不会抛异常，只会返回绝对路径本身，天然以 `rel` 不含预期分段的形式安全落到"不受治理"分支，无需额外 try/catch）
- 现有 `pre-write.mjs`/`post-write.mjs` 的 JSON 解析容错（`try { JSON.parse } catch { process.exit(0) }`）保持不变

## Transaction Boundaries
不适用。

## Testing Strategy
- Unit:
  - 新增 `gates.mjs` 的路径片段匹配单测（可直接 `import` 函数调用，不需要 spawn 子进程）：覆盖 `reference-service/src/main/java/...`（向后兼容）、任意模块名 `foo-service/src/main/java/...`（多模块场景）、`src/test/java/...`（test kind）、`openapi/x.yaml`、**黑名单只作用于祖先段**的两个边界用例——`order-service/target/generated-sources/annotations/src/main/java/Foo.java`（祖先段含 `target`，必须断言返回 `null`）与 `src/main/java/com/acme/target/service/Foo.java`（黑名单词 `target` 出现在匹配段之后的包名里，必须断言返回非 `null` 的 `main` kind，锁定"黑名单不检查匹配段自身或其后路径"这一算法决策）、完全不匹配路径返回 `null`
  - `hasChangeTracking` 单测：有/无 `harness/changes` 目录两种场景
- Integration（**关键**——覆盖 ARGUMENTS 中明确要求的"真实触发 hook 而非字符串匹配 SKILL.md 文本"）：
  - 新建临时目录（`fs.mkdtempSync`）模拟一个**不叫 reference-service** 的目标项目：`<tmp>/order-service/src/main/java/Foo.java`、`<tmp>/harness/ACTIVE_CHANGE`、`<tmp>/harness/changes/<id>/state.json`（`gates.designApproved=false`）
  - 用 `child_process.spawnSync('node', ['pre-write.mjs'], { cwd: tmp, input: JSON.stringify({tool_input:{file_path: '.../Foo.java'}}) })` **真实 spawn hook 子进程**，断言 `status === 2` 且 stderr 包含 `BLOCK`
  - 反向用例：`gates.designApproved=true` + 匹配的 RED 证据 → 断言 `status === 0`
  - `post-write.mjs` 场景：临时目录只有 `harness/changes/<id>/`（无 `harness/specs/`），`state.json` 缺 `validation.md`/`change.md` → 断言（在 `hasChangeTracking` 修复后）能报出 `missing validation.md` 一类的错误，而不是静默 `exit(0)`
  - `.java` 提醒用例：临时目录里一个 `.java` 文件在非常规目录（如 `<tmp>/scripts/Migrate.java`）→ 断言 `status === 0` 且 stderr 包含提醒文案，不含 `BLOCK`
  - 所有临时目录测试结束后清理（`fs.rmSync(..., {recursive:true})`），不得污染仓库自身的 `harness/ACTIVE_CHANGE`（参考 CHANGELOG 0.1.10 "smoke 污染修复"的教训）
- Backend API E2E: 不适用（无 HTTP API 变化）
- RED path: 先写上述新增测试并确认失败（当前实现下，非 `reference-service` 命名的路径不会被 BLOCK，测试断言 `status===2` 会失败——这就是 RED），再实现 `gates.mjs`/`pre-write.mjs`/`post-write.mjs` 改动使其转绿

## Rollout and Rollback
- 本变更只影响 harness 自身 runtime（`harness/plugin/runtime/`），随下一次插件版本发布（`npm run release`）分发，无需数据库迁移或独立灰度
- 回滚方式：还原 `gates.mjs`/`pre-write.mjs`/`post-write.mjs`/`checks.mjs` 到改动前版本即可，无状态迁移，风险低
- 发布前必须跑 `node harness/plugin/runtime/cli.mjs verify` 全量 smoke（含新增用例），并对本仓库自身 `reference-service` 路径做一次真实回归（确认向后兼容未破坏）

## Risks
1. **多模块/生成物目录误命中风险 与 反方向的漏保护风险**：两个方向都需要兼顾——（a）生成物目录嵌套在模块内部时可能被误判为受治理路径（过度拦截）；（b）业务包名恰好包含黑名单同名词时可能被误判为不受治理（漏保护，对治理工具而言后果更重）。缓解：黑名单检查限定在"匹配到 `src/main/java`/`src/test/java`/`openapi` 之前的祖先段"（见 Flow / State Changes 第 3-4 步），不检查匹配段自身或其后的包名路径，同时解决两个方向的问题；如实践中发现新的误报/漏报模式，按现有 waiver 流程记录例外。
2. **`post-write.mjs` 行为收紧带来的噪音**：`hasChangeTracking` 放宽后，更多真实目标项目会开始触发 `validateArtifactStates`/`validateReviewVerdicts`/`validateChangeEvidence` 报错（这是本次改动的**目的**而非副作用），但对已经在用 `start-change` 但从未规范维护 `state.json`/评审文件的历史项目，升级后可能突然看到大量新报错。缓解：这是"之前该拦未拦"的补课，CHANGELOG 中需要显式说明这一行为变化，属于预期内的 breaking-in-a-good-way 变更。
3. **性能**：路径片段匹配是 O(路径深度)，可忽略不计；`.java` 提醒分支不引入额外文件系统调用。风险低。
4. **跨平台路径分隔符**：Windows 下 `path.sep` 为 `\`，需要与 `harness/specs/platform-validation-matrix.md` 已有的"Windows 路径分隔符下 governed path 拦截"验证项对齐，实现时在该 matrix 对应用例上补充断言。

## Open Questions
1. `validateOpenApiLight`/`validateControllerConsistency` 存在同类硬编码问题（见 Current-State Evidence），是否作为后续独立 change 处理？（建议：是，本轮不扩大范围）
2. 是否需要在 `doctor.mjs` 增加"扫描整个项目、报告受治理路径覆盖情况"的更全面诊断命令？（建议：留作 fast-follow，当前 `.java` 提醒已覆盖 clarify 确认的最小范围）
3. OpenAPI 契约文件的探测目前仍要求目录字面量为 `openapi`；如果后续用户反馈常见于 `api/`、`contracts/` 等命名，需要新开 clarify 讨论是否扩大探测规则。

## Design Self-Review
- 是否覆盖 clarify 三个决策：✅（自动探测/提醒不拦截/一并修 post-write）
- 是否保持向后兼容：✅（`reference-service` 路径经路径片段匹配仍然命中，已在 Testing Strategy 中安排回归用例）
- 是否引入新的机械门禁而非停留在文档提示层面：✅（核心修复本身就是让 `pre-write.mjs` 的机械 BLOCK 对真实目标项目生效；新增测试要求真实 spawn 子进程触发 hook，而不是字符串匹配 SKILL.md，直接回应 ARGUMENTS 里点出的"虚假测试"问题）
- 是否有范围蔓延：已识别 2 处相关但范围外的硬编码（`validateOpenApiLight`/`validateControllerConsistency`），明确记为 Open Question 而非顺手改掉
- design-reviewer 复审 verdict：`pass`（`reviews/design-reviewer.json`，reviewedAt=2026-07-22）。复审同时主动指出一个 advisory（黑名单"任意位置命中"会误伤包名含黑名单同名词的业务代码，导致漏保护），已在本轮自查中采纳并修正为"黑名单只检查匹配位置之前的祖先段"，无需因这一改进重新触发 review（原 blocking finding 已解决，本次是在 pass 基础上的主动加固，未引入新的设计缺口）

## Approval
待 `design-reviewer` 消费。
