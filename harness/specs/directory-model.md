# 目录模型规范

## 目的

明确本项目企业 harness 的主要目录职责，降低弱模型在目录间误放资产的概率。

## 目录职责

### `CLAUDE.md`
项目短地图与操作合同。

### `.claude/rules/`
Claude Code 自动加载的项目规则。

### `.claude/agents/`
Claude Code 可发现的项目 subagent / reviewer。

### `.claude/skills/`
项目级 skill。

### `hooks/`
本地快速反馈与完成前门禁脚本。

### `harness/templates/`
可复用模板。

### `harness/specs/`
长期稳定规范。

### `harness/changes/<change-id>/`
活动变更资产：

- `state.json`
- `change.md`
- `specs/`
- `design.md`
- `tasks.md`
- `validation.md`
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
