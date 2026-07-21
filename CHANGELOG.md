# Changelog

本文件记录 enterprise-harness 各版本的重要变化。版本遵循语义化版本约定。

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
