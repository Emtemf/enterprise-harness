# Changelog

本文件记录 enterprise-harness 各版本的重要变化。版本遵循语义化版本约定。

## [0.1.28]

### Fixed
- **TECP 卡现在每次写完文件后都打印**：之前只在 session-start 和 BLOCK 时打印，整个推进过程用户看不到进度。现在 post-write hook 每次写完文件后输出 TECP 卡，会话里进度全程可见。
- **codegraph 证据门禁**（issue #53）：pre-write 新增第 12 道拦截——如果 `state.json` 的 `tooling.codegraph` 仍为 unknown/空，写受治理路径直接 BLOCK。程序级拦截，不依赖模型自觉。

### Changed
- **README 统一两种运行模式**：原生 Claude Code（自动挡）vs 非原生宿主/opencode/CI（手动挡），说明为何两种模式门禁都生效。
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

- 删除根 `rules/` 僵尸目录、agents 收敛为 `.claude/agents/` 单一来源、归档一次性 demo change、shell 校验脚本迁移到 `harness/plugin/runtime/verify-scripts/`。

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
