# 目录模型规范

## 目的

明确本项目企业 harness 的主要目录职责，降低弱模型在目录间误放资产的概率。

## 目录职责

### `AGENTS.md`
仓库级的人类 / agent 协作合同，不依赖 Claude Code 自动加载，但应作为 repo-facing 前门存在。

### `CLAUDE.md`
项目短地图与 Claude Code 高层操作合同。

### `PROGRESS.md`
repo-facing 的阶段快照与继续阅读入口；不替代 `harness/ACTIVE_CHANGE` 与 `harness/changes/*/state.json` 的动态真相职责。

### `.claude/rules/`
Claude Code 自动加载的项目规则。

### `.claude/agents/`
Claude Code 可发现的项目 subagent / reviewer。

### `.claude/skills/`
项目级 skill。

### `harness/plugin/runtime/hooks/`
Claude Code hook 执行体与完成前门禁脚本。

### `hooks/`
plugin-installed hook manifest：`hooks/hooks.json` 使用 `${CLAUDE_PLUGIN_ROOT}` 定位执行体。

### `.claude/settings.json`
standalone checkout hook manifest：使用 `$CLAUDE_PROJECT_DIR` 定位执行体。两个 manifest 调用同一组 `harness/plugin/runtime/hooks/*.mjs`，行为必须保持一致。

### `harness/templates/`
可复用模板，例如 `requirements.md`、`design.md`、`tasks.md`、`validation.md` 等 staged workflow 资产模板。

### `harness/specs/`
长期稳定规范，例如 staged-workflow、plugin runtime、session-lifecycle、local adapter、evidence submission、containerization/sandboxing 等长期真相。

### `harness/changes/<change-id>/`
活动变更资产：

- `requirements.md`
- `state.json`
- `change.md`
- `specs/`
- `design.md`
- `tasks.md`
- `validation.md`
- `reviews/`
- `evidence/`

### `harness/archive/`
已冻结历史。

### `harness/explorations/`
独立探索证据与影响分析。

### `harness/work/`
历史 MVP 活动工作区；当前阶段保留兼容，但不再作为长期规范源。

## 规则

- 新规范优先进入 `.claude/rules/` 或 `harness/specs/`
- 新活动变更优先进入 `harness/changes/`
- `harness/archive/` 不允许直接编辑
- 根 `rules/` 与 `agents/` 当前视为历史参考，不再作为运行时唯一真相
