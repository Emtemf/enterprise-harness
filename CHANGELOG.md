# Changelog

本文件记录 enterprise-harness 各版本的重要变化。版本遵循语义化版本约定。

## [Unreleased]

## [0.3.4] - 2026-08-03

### Fixed

- `handoff create` 在传入不合法 behavior 时不再只报 `unknown governed behavior`
  而不列合法值。现在错误消息附带 `legal behaviors:` 列表，用户可自助恢复。
  行为注册表已在作用域内，零额外 I/O。

## [0.3.3] - 2026-08-03

### Fixed

- 消除本仓库开发时的 hook 双重执行。`.claude/settings.json` 的每个 hook 现在带
  `test -z "$CLAUDE_PLUGIN_ROOT"` 守卫：插件已加载时 settings.json hook 自动跳过，
  只执行插件 hook；插件未加载时（开发场景）正常执行。此前在本仓库同时作为插件
  加载时，每个 PreToolUse/PostToolUse/SessionStart 等事件执行两次相同代码。
- 修复 0.3.2 `runtime/` 路径重构后 External Project E2E 的路径回归。`stageRuntime()`
  现在同时复制 `harness/` 和 `runtime/` 到临时目标项目，不再依赖旧的
  `harness/plugin/runtime/` 路径。

## [0.3.2] - 2026-07-31

### Changed

- `runtime/` 从 `harness/plugin/runtime/` 提升到项目根目录。`harness/` 合同只应包含
  specs、changes、archive、templates 和 state；实现代码放在其下是历史遗留，
  本次将其移至 `runtime/` 并更新全部 120+ 处引用（hook 注册、测试 import、
  打包白名单、docs、specs、skills 和 E2E 测试）。目录内容不变，纯路径重构。

### Fixed

- 修复 release 脚本重复插入 CHANGELOG 版本标题的问题。此前脚本无条件插入标题，
  维护者手写的 section 被复制一份。现检查标题是否已存在再决定是否插入。

### Fixed

- 修复 0.3.0 移除 standalone 安装器导致的 External Project E2E 回归。该测试原本借用
  安装器把 runtime 资产铺进临时 Maven 项目；plugin 通道由 Claude Code 投递资产，
  headless 测试无法驱动，因此改为测试内自行复制同一份资产子集。

### Added

- 新增 `npm run test:everything` 聚合入口，一条命令依次跑 `test:ci`、`test:all`、
  `docs:check`、`test:e2e`。此前四条流水线彼此独立且没有任何命令覆盖全部，
  是上述回归进入 main 的机械成因。维护者文档不再把只含 smoke suite 的
  `test:all` 称为「完整」。

## [0.3.0] - 2026-07-31

### Removed

- 移除 standalone 分发通道。`bin/install.mjs` 安装器、`install-to` script、
  `transactional-install` 能力声明及其 smoke 一并删除。standalone 早于 plugin 存在，
  是最初的 MVP 形态，plugin 出现后从未拆除；产品方向为 Claude Code plugin only。
- `.claude/settings.json` 不再是第二条分发通道，改为本仓库自用的开发通道，
  让维护者能对工作目录代码验证 hook 改动。它不进发布包，也不是用户安装方式。

### Fixed

- 修复探索 gate 误拦无害命令。此前判定逻辑是「每个目标都必须命中豁免 allowlist」，
  导致四类命令被错误阻断：解析不出路径目标的命令、含 `2>/dev/null` 重定向的命令、
  正则字面量被误当路径的命令，以及任何仓库 root 之外的路径。现在复用写入 gate 的
  `isGovernedTarget()`，只判断目标是否命中受治理路径，豁免 allowlist 随之删除。
- 修复受治理 subagent 在插件之外无法派发的死锁。`pre-agent` 要求 subagent_type 带
  `enterprise-harness:` 前缀，但该前缀只在 Claude Code 以插件加载时存在；在本仓库
  开发时 agent registry 只有裸名，两种写法都失败——带前缀报 agent-not-found，
  裸名被 hook 阻断。现在两种写法统一 normalize，HANDOFF_INPUT 证据校验不变。

## [0.2.35] - 2026-07-30

### Fixed

- 解除 3 个 smoke 对 `plugin-runtime-agent-dispatch-hardening` 的硬编码依赖。
  `cumulative-write-gate` 改为生成动态 fixture 而非复制真实 change 资产；
  `tdd-receipt-contract` 和 `tdd-run-baseline` 用动态 changeId 替代硬编码名称。
- `validateTddReceipt` 的 bootstrap provenance 限制从特定 changeId 泛化为
  任何 change 的 task-1。

## [0.2.34] - 2026-07-30

### Fixed

- 修复真实插件安装态下所有 Bash 写入被永久阻断的问题。当插件 manifest 与目标仓库
  `.claude/settings.json` 注册了同一套 hook 时，Claude Code 会按注册数逐次运行
  PostToolUse：第一次消费并删除写入前快照，第二次找不到快照即判为无法归因并 BLOCK。
  现在消费快照时留下 consumed marker，使「重复投递的已归因写入」与「从未建立快照的
  未归因写入」可区分；后者仍然阻断。marker 超过 24 小时由下一次 pre-write 清理。

- 修复 `start-change` 产出的 DRAFT scaffold 无法通过 `verify`/`prepublish-check` 的
  问题。`validateAmbiguityGate`、`validateRouterScore` 与 `validateChangeEvidence`
  的 validation.md 检查现在跳过 state=DRAFT 的 change，不再在澄清尚未开始时就要求
  评分和验证证据。

## [0.2.33] - 2026-07-30

### Fixed

- 失败的 Agent 派发不再永久阻断 `TaskCompleted`。此前 ledger 已记录 failure，但 gate 只判断「有 dispatch 无 checker verdict」，导致任何一次派发失败都无法恢复。
- task review 不再能在未绑定执行 receipt 的情况下通过。新增 `EH-COMPLETION-REVIEW-114`，要求 review 的 `receiptDigest` 与已导入 receipt 一致。

### Changed

- route 成为独立阶段 gate：新增 `workflow.routeReady`、独立入口 `/harness-route` 与 `route-decider` executor；`routeReady` 为 false 时不能进入 design。
- clarify 改用专审澄清质量的 `clarify-reviewer`；`requirement-reviewer` 归位为 route 的分流 checker，executor/checker 不再跨阶段复用。

## [0.2.32] - 2026-07-30

### Fixed

- Stop gate 只校验当前 `ACTIVE_CHANGE`，不再让非活动历史 change 阻断当前会话。
- 发布包改用跨平台确定性 ustar/gzip writer；Windows 路径、动态 import、CLI shim 与测试隔离合同同步修复。
- Context7 launcher 在 Windows 保持含空格参数的 argv 边界；Claude Code 插件验收使用独立用户目录与独立目标项目，不再污染或复用维护仓库的 local scope。
- validation digest 的跨平台验收与生产口径统一排除易变 revision/event 字段，gate 失败会输出可直接定位的结构化诊断。
- post-write 使用 canonical path 判断 active change，在 macOS `/var` 与 `/private/var` 等价路径下仍会可靠地使验证证据过期。
- `verify --json` 会等待诊断输出完成后再以失败码结束，避免 Node 20/macOS 丢失大体积 blocker JSON。
- 依赖远程 marketplace 的在线安装测试从确定性 prepublish suite 分离。

## [0.2.31] - 2026-07-30

### Fixed

- 测试 fixture 不再嵌入维护者机器的绝对路径，并由发布验收阻止类似路径重新进入运行时测试。

## [0.2.30] - 2026-07-30

### Changed

- 受治理阶段统一为 `main orchestrator → isolated executor → durable TECPC handoff → independent checker → hook gate`。
- executor/checker 通过 agent `skills:` 确定性预加载专用 Skill；TDD 继续额外使用 worktree 文件隔离。
- clarify 每轮评分增加 0-5 整数、评分依据、Overall 平均值与 weakest dimension 的机械合同。
- release/completion 不再依赖 Claude 账户、认证、订阅、配额或服务容量。
- TDD 命令改为目标项目 policy 与 task 级 exact argv，不再绑定本仓库 task-1～task-4。
- 文档收敛为用户、维护者、八个主合同、ADR/营销/内部状态四个阅读面。
- 删除旧 `harness/bin/*.sh` 与 shell verify 第二实现，Windows 发布包只依赖 Node runtime。

### Added

- `harness/behavior-checks.json`、统一 handoff runtime、durable `runs/<run-id>/` 资产。
- `EH-*` 稳定错误码、`enterprise-harness handoff explain` 与 `enterprise-harness trace`。
- design/plan/verification executors、clarify synthesizer 与 implementation reviewer。
- handoff、隔离接力、hook registry 和 ambiguity scoring contract smoke。
- 安全路径 containment、事务安装与回滚、发布 artifact allowlist/manifest/SHA256/SBOM。
- Bash 写入前后增量快照、revision CAS、幂等 eventId、结构化 completion layers。
- 外部 Spring/Maven 项目的真实 RED/GREEN/REFACTOR 验收流水线。

### Fixed

- 代码探索不再因同一 Bash 命令包含 README/docs 字符串而整体豁免。
- API/OpenAPI 解析不到内容时返回 `unsupported`，不再作为空错误集静默通过。
- doctor 默认离线，不再动态下载或探测最新 Context7 CLI。
- 安装器不再覆盖已有 `CLAUDE.md`、`AGENTS.md` 或非 harness settings。

## [0.2.5]

### Fixed
- **历史 validation 资产补齐到新 verify 标准**：补齐 `generic-openapi-controller-consistency-checker` 与 `intake-smoke-demo` 的 `validation.md` 最低可消费内容，并按正式 `computeValidationDigest()` 逻辑同步 `state.json.validation.digest`，让新的 verify/prepublish 检查在历史 change 上也成立。

## [0.2.4]
## [0.2.4]

### Fixed
- **维护层 spec 口径与 phase 1 对齐**：`plugin-runtime.md`、`mvp-governance.md`、`directory-model.md` 不再混用旧的 旧运行层叙事 / legacy `rules/` / `agents/` / `hooks/` 真相层表述，统一回到当前 `.claude/` 自动加载层与 `runtime/hooks/` hook 执行体模型。

## [0.2.3]
## [0.2.3]

### Fixed
- **CodeGraph-first 绕过修复**：`pre-explore` 现在也会拦截探索型 `Bash` 命令，插件安装态 `hooks/hooks.json` 同步覆盖 `Bash`，不再允许主 orchestrator 用 Bash grep/find 绕过 `code-explore`。
- **verify 最低可消费内容检查增强**：`validation.md` 现在至少必须包含 `Commands Executed`、`Stage Gate Summary`、`Final Verdict` section，`verify` 不再只做文件存在性检查。
- **verification-reviewer 消费时机收紧**：进入 `REVIEWED` / `VALIDATED` 前都要求 `verification-reviewer` verdict，不再只在 `VALIDATED` 前强制。
- **phase 1 contract 与实现进一步对齐**：修复 `/harness` TDD 派发、clarify/route 恢复入口、exploration contract 放松、以及 verify 真实输出 contract 等与设计漂移的问题。

### Added
- 新增 `verify-validation-content-smoke.mjs`：机械校验 `validation.md` 是否具备最低可消费 section。
- 新增 `verify-runtime-output-smoke.mjs`：机械校验 `verify.mjs` 已真实输出 `completion-verdict` / `blockers` / `next-step` 等字段。

## [0.2.2]
## [0.2.2]

### Fixed
- **Phase 1 contract 与实现对齐**：修复 `/harness` 仍派发 `general-purpose` 做 TDD、`workflow.mjs` 中 clarify/route 恢复入口仍写成 `/harness`、以及 exploration contract 对主 orchestrator 直接探索业务代码放得过宽的问题，统一回到当前 phase 1 设计。
- **Verify 运行时输出 contract 补齐**：`verify.mjs` 现在真实输出 `completion-verdict`、`blockers`、`consumed-evidence-summary` 与 `next-step`，不再只是文档上声明。
- **OpenAPI 能力表述修正**：README 与 lifecycle truth 不再误称已具备“通用 OpenAPI ↔ Controller 一致性检查”，改回与 `CLAUDE.md` 一致的真实边界。
- **Claude Code-only phase 1 口径补正**：明确 Claude Code-only 指交互与编排收口到 Claude Code，`harness/` 继续承载 repo truth / durable assets；同时突出 CodeGraph-first / Context7-first 是 phase 1 的双探索亮点。

### Added
- 新增 `verify-runtime-output-smoke.mjs`：机械校验 `verify.mjs` 已真正实现 completion verdict 输出 contract。
- 新增 `phase1-positioning-smoke.mjs`：机械校验 phase 1 文档不会误删 `harness/` 地位，并会突出 CodeGraph / Context7 双探索通道。

## [0.2.1]
## [0.2.1]

### Fixed
- **Claude Code-only phase 1 文档口径修正**：移除 README / overview / installation-guide 中残留的“旧多模式叙事中的第二模式 / 旧多宿主叙事 / 旧运行层叙事”旧叙事，统一回到当前产品真相：交互与编排收口到 Claude Code，`harness/` 继续承载 repo truth、durable assets、动作层与统一业务原语。
- **CodeGraph / Context7 亮点补正**：在 phase 1 相关文档中明确 CodeGraph-first 与 Context7-first 是双探索通道和核心亮点，而不是附属工具。

## [0.2.0]

### Changed
- **Claude Code-only phase 1 基线建立**：项目正式收口为“`/harness` + 阶段 skill + 专职 agent + hook 接缝层 + 统一业务原语层”的第一阶段架构，不再把所谓 runtime 视为第二编排器。
- **`CLAUDE.md` 摘要化 + specs 渐进披露**：`CLAUDE.md` 收敛为短地图、承重墙、当前架构原则与导航；深层设计复盘、边界、上游映射与阶段 contract 下沉到 `harness/specs/`。
- **specs 真相层建立索引**：新增 `harness/specs/README.md`，将方向层 / 边界层 / 合同层分类，防止继续无边界膨胀。

### Added
- **phase 1 设计基线文档**：新增 `claude-code-only-phase1.md`、`claude-code-only-phase1-blueprint.md`、`agent-skill-boundary.md`、`upstream-mapping.md`、`hook-adapter-and-primitives.md`。
- **TDD 专职执行 contract**：新增 `tdd-execution.md` 与 `tdd-executor` agent；明确输入/输出字段、worktree 隔离、真实 `mvn test` / `mvn verify` / `mvn compile` 执行要求。
- **verify / reviewer / double-check contract**：新增 `verify-contract.md`、`reviewer-verdict-contract.md`、`double-check-model.md`，把 `pass / advisory / block` 的消费语义、`completion-verdict`、reviewer verdict 最小 schema 与 stop/verify 门禁对齐。
- **恢复提示原语**：新增 `recovery-guidance.mjs`，把 stop 的恢复提示抽成统一业务原语。

### Fixed
- **TDD 阶段的 skill/agent 边界更清晰**：`/harness-tdd` 明确只做阶段编排与结果消费，执行细节下沉给 `tdd-executor`。
- **hook / 原语层边界更清晰**：通过 `hook-primitives-boundary-smoke` 等 contract smoke，明确 hook 接缝层消费原语，而不重复定义完整阶段逻辑。
- **插件 agent 暴露面同步**：`tdd-executor` 已加入 plugin surface，并通过安装面 smoke 验证。

### Tests
- 新增并通过一组 phase 1 checkpoint smoke：
  - `tdd-execution-contract-smoke.mjs`
  - `tdd-executor-agent-smoke.mjs`
  - `tdd-executor-output-contract-smoke.mjs`
  - `tdd-skill-boundary-smoke.mjs`
  - `verify-contract-smoke.mjs`
  - `verify-verdict-consumption-smoke.mjs`
  - `reviewer-verdict-contract-smoke.mjs`
  - `double-check-model-smoke.mjs`
  - `hook-primitives-boundary-smoke.mjs`
  - `recovery-guidance-smoke.mjs`

## [0.1.33]

### Fixed
- **issue #61：等待 subagent 时主 agent 死循环刷屏**：将“等待可通知任务时禁止轮询刷屏”提升为仓库硬约束，并同步到 `CLAUDE.md`、`.claude/rules/00-workflow.md`、`/harness` skill。主 orchestrator 在 `Agent` / `Monitor` / 后台 Bash 已可由 Claude Code 自动通知完成时，不得再用 `sleep`、倒计时、循环“继续等待”或反复状态播报占用对话。
- **clarify / route 恢复入口不明确**：`recommendNextEntry()` 现在对 `clarify` / `route` 默认返回 `/harness-intake`，与 staged entry 设计保持一致；README、overview、installation-guide、harness skill 已同步恢复入口说明。
- **stop hook 恢复入口错误**：`stop.mjs` 删除本地 `recommendNextEntry()` 覆盖，改为委托 `lib/workflow.mjs`，handoff guidance 会根据当前 stage 输出正确恢复入口。
- **status 页面恢复入口被写死**：`status-summary.mjs` 不再把 `recommendedEntry` 固定成 `/harness`，而是复用 active change 的 `nextEntry`。`cli.mjs status` 现在会正确显示如 `/harness-plan` 这样的阶段恢复入口。

### Added
- 新增 `subagent-waiting-contract-smoke.mjs`：机械校验“禁止轮询等待、依赖 Claude Code 通知机制”的合同。
- 新增 `workflow-next-entry-smoke.mjs`：机械校验 clarify/route/design/plan/tdd/verify/archive 的恢复入口映射。
- 新增 `status-summary-next-entry-smoke.mjs`：机械校验 status summary 复用 active change 的 `nextEntry`，不再回退成硬编码 `/harness`。
- 新增 `stop-recommend-next-entry-smoke.mjs`：机械校验 stop hook 的恢复入口来自 `lib/workflow.mjs`。

## [0.1.32]

### Fixed
- **issue #59：design/plan 产物缺失**：弱模型在 design 阶段不创建 `design.md` 就跳到 plan，plan 阶段不创建 `tasks.md` 就跳到 tdd。三层加固已到位：
  - CLAUDE.md / harness SKILL / harness-design SKILL / harness-plan SKILL 新增【硬约束】section，明确"必须用 Write 创建 design.md/tasks.md，不得跳过"。
  - pre-write hook 已有的 stage-level artifact guard（design.md / tasks.md 不存在则 BLOCK 受治理路径写入）现在被 skill 层显式声明，弱模型也能看到。
- **issue #59：TDD 不是 subagent 形式、无 worktree、不跑 mvn**：harness-tdd SKILL 新增【硬约束】section——TDD 必须通过 Agent 工具派遣 subagent，必须 `isolation: "worktree"`，subagent 必须执行真实构建命令（`mvn test`/`mvn verify`），禁止主对话直接写代码。harness/SKILL 第 5 步与禁止事项同步强化。
- **跨文档一致性对齐**（全局 double check 发现的 gap）：
  - `harness/specs/staged-workflow.md` TDD section 补充 subagent+worktree+真实构建命令执行要求（之前只列子状态）。
  - `harness-tdd/SKILL.md` 行为要求中"默认优先使用 worker/subagent"对齐为"必须使用"。
  - `README.md` TDD 描述补充 subagent+worktree+真实构建命令。
  - 动词统一：TDD 相关从"默认应优先调用 mvn"升级为"必须执行 mvn"。
- smoke 测试同步更新：`tdd-subagent-contract-smoke` 新增 worktree/禁止直接写代码/禁止不跑构建验证；`tdd-build-command-contract-smoke` 对齐"必须执行"措辞。64/64 全绿。

## [0.1.31]

### Fixed
- **对话文本 TECPC 可见性**：CLAUDE.md 和 harness SKILL 新增"每步操作后输出 TECPC 状态卡"强制规则——模型必须在对话文本中输出进度卡，不再只依赖 hook 输出（用户看不到系统消息的问题）。
- **issue #56**：subagent 探索后主 agent 仍直接探索 + 无 codegraph 使用。5 层约束已到位（CLAUDE.md + rules + SKILL + pre-explore hook + smoke），弱模型可能仍无视。

## [0.1.30]

### Fixed
- **72/72 smoke 测试全绿**：修复 `gate-hardening-red-task-smoke` fixture 缺 codegraph 证据、`plugin-install-flow-smoke` 输出格式误判。全量验证通过。
- **TECPC 卡样例与实际输出对齐**：lifecycle-truth 和 acceptance-guide 的卡片样例从旧顺序（T→C→E→P）修正为实际输出顺序（T→E→C→P→C），补全 C 纠正行。
- **README 同步**：补充版本号（v0.1.30）、pre-explore hook 描述、subagent 标题约束。

## [0.1.29]

### Added
- **pre-explore hook（探索阶段程序级门禁）**：新增 PreToolUse matcher `Grep|Read|Glob` → `pre-explore.mjs`。主 orchestrator 直接用 Grep/Read/Glob 探索业务代码时，如果 `state.json` 无 codegraph 使用证据，直接 BLOCK。修复了之前 codegraph 门禁只覆盖 Write/Edit、探索阶段（读操作）完全不拦截的问题（issue #54）。
- 智能豁免：读 harness/ 内部文件、CLAUDE.md、docs、配置文件不拦截；无 active change 不拦截；已有 codegraph 证据不拦截。
- 新增 `pre-explore-smoke.mjs`（7 个场景）。

### Fixed
- **根因修复**：v0.1.28 的 codegraph 门禁只在 Write/Edit 时触发，但模型探索用的是 Grep/Read/Glob（读操作），所以 hook"未生效"。现在探索阶段也有程序级门禁。

## [0.1.28]

### Fixed
- **TECP 卡现在每次写完文件后都打印**：之前只在 session-start 和 BLOCK 时打印，整个推进过程用户看不到进度。现在 post-write hook 每次写完文件后输出 TECP 卡，会话里进度全程可见。
- **codegraph 证据门禁**（issue #53）：pre-write 新增第 12 道拦截——如果 `state.json` 的 `tooling.codegraph` 仍为 unknown/空，写受治理路径直接 BLOCK。程序级拦截，不依赖模型自觉。

### Changed
- **README 统一两种运行模式**：原生 Claude Code（旧自动模式叙事）vs 旧多宿主叙事/opencode/CI（旧手动模式叙事），说明为何两种模式门禁都生效。
- **彻底清除 g4c 命名**：文件/函数/测试全部改为 tecp。

## [0.1.27]

### Fixed
- **证据链现在每次阶段推进都可见**：`lifecycle.mjs` 的 `state` / `gate` 命令执行后输出 TECP 卡，用户每次推进阶段都能看到证据链（T目标/C上下文/E证据/P路径/纠正 + Ladder ✓/▸/○），不再只在 session-start 和 BLOCK 时可见（issue #52）。

### Changed
- **彻底清除 g4c 命名**：文件 `g4c-card.mjs` → `tecp-card.mjs`，函数 `renderG4CCard` → `renderTECPCard`（删除向后兼容别名），测试 `g4c-card-smoke.mjs` → `tecp-card-smoke.mjs`。runtime 代码 g4c 引用归零。

## [0.1.26]

### Changed
- **全生命周期真相文档完全重写**（`docs/zh-cn/full-lifecycle-truth.md`）：15 步时序全部按 TECP 维度组织，每步包含：涉及文件表、产出文件、预期输出示例、异常检测表。用户在任何一步都能对照文档判断"对不对"。
- **歧义评分增强**：`ambiguity-scoring.md` 新增 7 个维度的详细评分标准（0-5 每级的具体判定标准 + 证据要求），新增交互格式示例和用户参与确认规则。
- **5 个 smoke 测试修复**：staged-template / mandatory-gate / session-contract / plugin-docs / lifecycle-truth 全部通过。

## [0.1.25]

### Changed

- **设计产出物全面 TECP 化**：design.md / requirements.md 模板从传统文档结构（Problem/Scope/Options）重组为闭环五检 (TECP) 驱动结构：
  - **T 目标**：业务目标 + 成功标准
  - **C 上下文**：探索事实 + 影响矩阵 + 技术约束
  - **E 证据**：每个决策有证据来源 + 测试策略 + 验证命令
  - **P 路径**：方案对比 + 接口/数据/架构设计 + 风险回滚 + **纠正预案**
- **design-reviewer agent** 新增 TECP 质量门禁：T 目标不能是占位符、C 上下文必须引用具体代码、E 证据必须有来源、P 路径必须有方案对比
- **harness-design SKILL.md** 重写为 TECP 四维 checklist
- **staged-workflow.md** design 阶段描述更新为 TECP 驱动
- **验收指南 / lifecycle truth** Step 5/6 设计产出物描述同步更新
- **CLAUDE.md** 设计阶段描述更新为 TECP 驱动

### Fixed
- 全仓库 G4C 维度名清理：Goal→T目标、Choice→P路径、Checkpoint→E证据、Correction→P纠正
- ambiguity-scoring.md / harness-intake SKILL / requirements template 中 `Goal clarity` → `T 目标 clarity`

## [0.1.24]

### Changed

- **G4C 重命名为闭环五检 (TECP)**：本项目的核心方法论从 G4C（Goal/Context/Choice/Checkpoint/Correction）重命名为 **闭环五检 TECP**（Target/Context/Evidence/Path），完全自主命名。
  - T = Target（目标）：要达成什么
  - C = Context（上下文）：知道什么、缺什么
  - E = Evidence（证据）：用什么证明对了
  - P = Path（路径 + 纠正）：为什么这么走、错了怎么办
- 卡片格式更新为 `│ T 目标 ▸ ... / │ C 上下文 ▸ ... / │ E 证据 ▸ ... / │ P 路径 ▸ ... / │ P 纠正 ▸ ...`
- `renderG4CCard` 保留为 `renderTECPCard` 的向后兼容别名
- README、验收指南、lifecycle truth 文档全面更新为闭环五检命名

## [0.1.23]

### Fixed

- **澄清约束提升到自动加载层**：将"一次只问一个问题"和"必须展示歧义度评分"从 harness-intake skill 提升到 `CLAUDE.md`（每次会话自动加载）。修复弱模型一次抛出多个问题、不显示 weakest dimension 评分的问题（issue #51）。

## [0.1.22]

### Fixed

- **委托约束提升到自动加载层**：将"代码探索必须委托 subagent"从仅 skill 层（需 `/harness` 触发）提升到 `CLAUDE.md` 和 `.claude/rules/10-code-analysis.md`（每次会话自动加载）。修复弱模型在 skill 未加载时直接 grep/Read 不委托 subagent 的问题（issue #50）。
- **release workflow 幂等修复**：添加 `make_latest: true`，避免手动 release 与 Actions workflow 冲突。

### Added
- `subagent-contract-smoke.mjs` 新增对 CLAUDE.md 和 10-code-analysis.md 的委托约束机械校验。

## [0.1.21]

### Added

- **G4C 用户验收指南**（`docs/zh-cn/g4c-user-acceptance-guide.md`）：每一步都按 Goal / Context / Choice / Checkpoint / Correction 五维验收，含预期效果、实际效果 checkbox、提 issue 所需证据清单和 issue 模板。
- **G4C 卡全链路回显**：`stop.mjs`（会话结束时）和 `verify.mjs`（验证通过时）现在也输出 G4C 进度卡，加上之前的 session-start / status / pre-write BLOCK，共 5 个触发点统一回显同一张卡。
- **scaffold 自动设置 goal**：`create-change-scaffold.sh` 和 `start-change.mjs` 现在将 topic 参数自动写入 `state.json` 的 `goal` 字段，不再显示"未记录"。

### Fixed

- **README 重写**：用 G4C 框架重新组织——开篇讲 G4C 五维 → mermaid 时序图 → 每步 G4C 验收表 → G4C 卡示例 → 机械门禁详表。用户打开第一眼就知道"这是什么、怎么工作、每步该看到什么"。
- **overview.md 矛盾修复**：删除"特别是 reference-service"过时表述，与"已泛化到任意项目"保持一致。
- **模板 state.json 补 G4C 字段**：`goal: null` / `successCriteria: []` / `routingReason: null`，新创建的 change 立即有 G4C 字段结构。
- **主 orchestrator 代码探索委派硬约束**：将"调用 Agent 时用 code-explore"提升为"主 orchestrator 不得自己直接 grep/Read，必须委托 subagent"（issue #49）。

## [0.1.20]

### Fixed

- **主 orchestrator 代码探索委派硬约束**：将"调用 Agent 工具时用 code-explore"提升为"主 orchestrator 不得自己直接用 grep/Read 搜索代码，必须委托 subagent"。修复弱模型绕过 Agent 工具直接自己探索的问题（issue #49）。

## [0.1.19]

### Added

- **G4C 进度卡**：新增 `renderG4CCard()` 纯函数，把变更进度渲染成 Goal / Context / Choice / Checkpoint(阶梯) / Correction 五维可视化卡片。三处统一回显：`cli.mjs status`、`session-start`、`pre-write` BLOCK 路径。
- `state.json` schema v3：新增可选字段 `goal`（目标）、`successCriteria`（成功标准）、`routingReason`（路由理由），旧 state 自动迁移补齐默认值。
- `state-migration.mjs` 新增 `migrateStateV2ToV3`：v2→v3 链式迁移，补 G4C 字段。

## [0.1.18]

### Fixed

- **pre-write 全阶段守卫**：将 pre-write.mjs 从单一 design.md 检查升级为完整的阶段产物守卫系统。写入受治理路径时，pre-write hook 现在会根据当前 workflow stage 机械校验所有前置阶段的产出物是否齐全：
  - `clarify`：`requirements.md` 必须存在 + `userConfirmedScope` 必须为 true
  - `route`：`tier` 必须已设置（L0-L3）
  - `design`：`design.md` 必须存在
  - `plan`：`tasks.md` 必须存在
  - `tdd`/`verify`/`archive`：已有 gate-level 检查（designApproved / RED 证据）
  
  模型跳过任何阶段都会被程序级 BLOCK，不依赖模型自觉（issue #47, #48）。

## [0.1.17]

### Fixed

- **pre-write 新增 design.md 存在性拦截**：如果 active change 已建立但 `design.md` 不存在，写入受治理路径（`src/main/java`、`src/test/java`、`openapi/`）时直接 BLOCK。这是程序级拦截，修复了弱模型澄清完直接跳到实现、跳过 design 阶段的问题（issue #48）。
- **subagent_type 强制约束**：`/harness` 和 `/harness-intake` 显式要求代码探索必须使用 `subagent_type: code-explore` 或 `impact-explore`，禁止使用 `general-purpose` 做代码探索（issue #47）。

## [0.1.16]

### Added

- **通用 OpenAPI ↔ Controller 一致性检查器**（`validateGenericControllerConsistency`）：自动扫描任意项目的 `openapi/*.yaml` 与 `*Controller.java`，比对 path + HTTP method 对齐，检测 OpenAPI 契约与 Spring Controller 之间的漂移。已集成到 post-write hook（写后自动检查）和 `cli verify`（契约检查入口）。regex 实现，不依赖外部 YAML/Java parser。reference-service demo 仍作为回归验证用例。
- `openapi-controller-consistency-smoke.mjs`：5 个 fixture 场景（aligned / path-mismatch / method-mismatch / no-openapi / no-controllers）+ reference-service 回归，覆盖 RED/GREEN/verify。

### Fixed

- `validateReferenceServiceControllerConsistency` 注释已明确标注为 demo-only；通用能力由新函数承担。

## [0.1.15]

### Fixed

- **subagent 编排契约收紧**：修复弱模型场景下 `code-explore` / `impact-explore` 被主 orchestrator 误用为模糊探索任务、标题被写成 `Explore enterprise-harness codebase`、以及 subagent 返回结论后主 agent 无视结论并重复探索的问题（issue #41 / #42 / #43 / #44 / #45 / #46）。
- **实现前 orchestration guardrails 提升为硬约束**：明确任何 L1+ 实现动作在 `clarify` / `route` 完成前不得开始，补到 `/harness`、`/harness-intake`、`CLAUDE.md`、`staged-workflow.md` 与验收文档。
- **版本一致性修复**：补齐 `manifest.json` / `plugin.json` 与 `package.json` 的版本同步。

### Added

- `/harness` 与 `/harness-intake` 明确要求 subagent 标题必须对准当前用户项目与具体探索主题，禁止硬编码 harness 仓库名。
- 明确必须等待 subagent 结论并消费结论，禁止忽略结论后重新发起相同探索。
- `code-explore` / `impact-explore` agent 文档补上“禁止笼统写成 `enterprise-harness` / `this repo` / `this codebase`”。
- `docs/zh-cn/expected-behavior-checklist.md` / `docs/zh-cn/full-lifecycle-truth.md` 新增 subagent 标题、结论消费与重复探索检查项。
- 新增 `subagent-contract-smoke.mjs`，机械校验 subagent 编排契约已落地。
- 新增 `orchestration-guardrail-smoke.mjs`，机械校验“未完成 clarify/route 前不得实现”这一 orchestration guardrail 已显式存在。


### Added

- **session-start hook 新增项目技术栈与 codegraph 提醒**：若目标项目存在 `harness/project-info.json`，启动时输出 `language` / `buildTool` / `testCommand` / `buildCommand` 等信息；同时始终输出 `codegraph-first` 工具提醒，强化 clarify 阶段默认行为。
- 新增 `harness/templates/project-info.json` 模板，用于声明目标项目的技术栈信息（默认为占位值，不硬编码 Java/Spring）。

## [0.1.11]

### Added

- **插件安装流程验证**：`plugin-install-flow-smoke.mjs` 端到端验证 marketplace add → install → update → 版本正确，发布前手动跑。
- **版本一致性机械检查**：`cli verify` 新增检查 package.json / manifest.json / .claude-plugin/plugin.json 版本一致，不一致精确报错。
- **`release.mjs` 自动同步三个版本文件**，从源头杜绝版本不同步（此前 0.1.10 发布时 plugin.json 漏更新导致安装旧版）。
- **`.gitignore` 排除 `dist/`**，防止打包产物误提交。

## [0.1.10]

### Added

- **插件分发机制**：`bin/install.mjs`（智能合并 settings.json）、`bin/package.mjs`（构建 tarball）、`bin/release.mjs`（一键 bump+tag+push）。
- **GitHub Actions release.yml**：tag 触发自动构建 tarball 并发布到 GitHub Releases。
- **GUIDE 导航卡机制**：scaffold 自动为每个 change 生成 GUIDE.md（机械字段自动填，软门禁提醒）。
- **README 重写**：参考 superpowers 叙事风格，体现 `/plugin marketplace add` + `/plugin install` 安装方式。
- **smoke 污染修复**：workflow-runner-smoke 改用临时 changeId，不再写真实仓库。

### Fixed

- `workflow-*-smoke` 会写真实仓库 active change 状态的副作用。

## [0.1.9]

### Added

- **`cli.mjs doctor-hooks` Stop hook 自检命令**：不用等会话结束，直接检查「全新会话会加载的所有 Stop hook 是否都输出合法 JSON」。实跑 enterprise-harness 自己的 stop hook，并静态标记可能触发 `JSON validation failed` 的第三方插件（如 oh-my-claudecode 输出 `continue`/`suppressOutput` 非法字段）。用于快速区分报错是否来自本插件。
- `lib/hook-audit.mjs`：`classifyStopStdout` / `extractEventCommands` / `collectStopSources` 纯函数。
- README 补充 doctor-hooks 用法；记录经验 `hook-changes-need-fresh-session`（hook 改动只对全新会话生效）。

## [0.1.8]

### Added

- **`cli.mjs update-local` 一键更新命令**：封装「marketplace update → plugin update（自动识别实际 scope）→ 清理旧版本缓存」一条龙，解决本地安装更新时漏 `--scope local`（报 `not installed at scope user`）和旧缓存残留导致旧 hook 继续报错的问题（issue #35 根源）。支持 `--dry-run` 预览。
- `lib/plugin-cache.mjs`：`selectStaleVersions` / `listVersionDirs` 纯函数，供缓存清理逻辑复用与单测。
- README 补充本地更新注意事项与 `update-local` 用法；记录经验 `local-plugin-update-scope-and-cache`。

## [0.1.7]

### Fixed

- **`.claude/settings.json` hook 变量作用域错误**：之前误把本地 settings.json 的 hook 路径也改成 `${CLAUDE_PLUGIN_ROOT}`，但该变量只在插件 `hooks/hooks.json` 有效，本地项目 settings 用它会报 `references ${CLAUDE_PLUGIN_ROOT} but the hook is not associated with a plugin` 并连带 `JSON validation failed`。改为 `$CLAUDE_PROJECT_DIR`（Claude Code 项目根变量）。
- 明确两文件分化：`settings.json` 用 `$CLAUDE_PROJECT_DIR`（本地开发），`hooks/hooks.json` 用 `${CLAUDE_PLUGIN_ROOT}`（插件分发），不再一刀切统一。
- 记录经验 `hook-var-scope-settings-vs-plugin`；`plugin-native-hooks-smoke` 增加 settings.json 变量断言。

## [0.1.6]

### Fixed

- **Stop hook "JSON validation failed" 报错**：`stop.mjs` 放行（exit 0）时 stdout 为空，不符合 Claude Code 的 Stop hook 契约（exit 0 会按 `{decision?, reason?, systemMessage?}` 校验 stdout）。改为放行输出 `{}`、阻断继续走 exit 2 + stderr。每次会话结束不再报错。
- 记录经验 `stop-hook-stdout-json`；`stop-handoff-smoke` 增加“放行路径 stdout 必须是合法 JSON”断言。

## [0.1.5]

### Added

- **经验库强制层浮现**：session-start hook 在 harness-managed 项目开会话时，自动把高危（severity=high）教训推到上下文最前，弱模型也漏不掉；非 harness 项目静默。把"同样问题不再犯"从 skill 指令层提升到 hook 强制层。
- `lib/lessons.mjs`：`readLessonIndex` / `highSeverityLessons` 纯函数，供 session-start 及后续消费方复用。

## [0.1.4]

### Added

- **跨 change 经验库 `harness/lessons/`**：`lifecycle lesson-add` / `lesson-list` 命令；clarify 阶段进入前自动检索、命中主动提示，verify 收尾记录新坑，闭环“同样问题不再犯”。
- **自动归档命令 `lifecycle archive <changeId>`**：VALIDATED 校验 + 物理移到 `harness/archive/` + 置 ARCHIVED + 清 active 指针 + 拒绝被 runtime smoke 引用的 change；接入 harness archive 阶段。
- **可复盘决策记录**：`workflow note`（clarify-qa / route-decided 事件）+ `workflow session-log`（渲染决策时间线）；clarify 阶段自动记录澄清问答与 route 决策。

### Fixed

- **runtime 自引用路径**：`workflow.mjs` / `start-change.mjs` 改为相对自身目录定位兄弟脚本，修复装进企业目标项目后 `workflow run` 报 `MODULE_NOT_FOUND`。

### Cleanup

- 删除根 `rules/` 僵尸目录、agents 收敛为 `.claude/agents/` 单一来源、归档一次性 demo change、shell 校验脚本迁移到 `runtime/verify-scripts/`。

## [0.1.3]

### Fixed

- **plugin.json 引用的 5 个 blocking reviewer 修正为完整版**：此前 `agents/` 下的 requirement / design / plan-critic / api-consistency / verification reviewer 是缺少 YAML frontmatter 的旧精简版，企业用户安装后 reviewer 可能无法被正确注册；现已同步为与 `.claude/agents/` 一致的完整定义。
- **cli.mjs 脚本定位修正**：兄弟脚本改为相对 `cli.mjs` 自身目录解析，仅将子进程 cwd 设为调用方目录，修复从非仓库目录调用时的 `MODULE_NOT_FOUND`。
- **移除 plugin.json 多余的 hooks 字段**：`hooks/hooks.json` 由 Claude Code 自动加载，manifest 再声明会触发 duplicate hooks 加载失败，导致插件安装后 `failed to load`。
- **validation digest 稳定性**：从 digest 计算中剔除 `state.json` 的 `revision` / `lastEventId` 与 `evidence/workflow-events.jsonl` 等每次 workflow 交互都会变动的易变项，修复 verify 反复误报 `validation digest mismatch`。
- **hooks 路径统一 plugin-native**：`.claude/settings.json` 的 hooks 与 `hooks/hooks.json` 同步为 `${CLAUDE_PLUGIN_ROOT}` 路径，修复企业项目安装后 hooks 找不到脚本。
- **文档硬编码绝对路径修正**：`README.md` / `CONTRIBUTING.md` 中的 Java quality gate 命令改为仓库相对路径。

### Changed

- 强化 SOP-first 约束：所有请求默认先经 `/harness` 进入 staged workflow，后续快速路径由 router 决定。

## [0.1.2]

- clarify-first staged orchestrator 第一版骨架：contract / template / worker / guidance / workflow-state / smoke 收口。
- plugin install surface + `/harness` 单入口 + onboarding 文档对齐。

## [0.1.1]

- 早期 runtime / 契约骨架迭代。

## [0.1.0]

- 初始 bootstrap MVP。
