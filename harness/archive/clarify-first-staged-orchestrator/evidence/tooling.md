# Tooling Evidence

## codegraph

- Status: available
- Project Path: `/home/wula/IdeaProjects/sdd`
- Queries:
  - `How do /harness skill, harness-intake skill, session-start hook, stop hook, and runtime status/start-change commands currently work together as the workflow entry and governance surface? Focus on .claude skills, hooks, runtime cli, and status summary.`
- Key Findings:
  - `/harness` 已明确采用三层模型：`Skill=编排`、`Command=本机/runtime 确定性动作`、`Hooks=自动提醒/阻断/校验`
  - `SessionStart` 与 `Stop` 已接入当前阶段、当前缺口、恢复入口与推荐探索通道的 guidance surface
  - runtime 层已具备 `status` / `doctor` / `verify` / `start-change` backend hub
- Fallback Reason: null

## Context7

- Status: partial-browser-evidence
- Library Name: Claude Code native extension surfaces / superpowers / oh-my-claudecode deep-interview
- Resolved Library ID: not-applicable
- Version: public-main-2026-07-15 observation
- Query: workflow-first skills/hooks/subagent packaging structure；socratic deep interview with ambiguity gating
- Key Findings:
  - `superpowers` 强在 workflow-first、skills-first、subagent-first 与自动提示下一步
  - `deep-interview` 强在一问一答、ambiguity scoring、先探索再问、显式确认执行范围
- Fallback Reason: 当前环境无法可靠通过 `WebFetch/curl/gh` 获取 GitHub 原始文件，因此采用浏览器公开页面观察并在 change-local exploration 中留痕

## Vendor / Official Docs

- Source: 公共 GitHub 页面观察（`superpowers` 与 `oh-my-claudecode`）
- Version / Snapshot: 2026-07-15
- Query: staged workflow / exploration lane / ambiguity gating
- Key Findings:
  - 当前主架构应建模成 Claude Code repo-local `.claude` 扩展层 + `harness/*` durable workflow state
  - clarify-first staged workflow 与 exploration lane 的 contract 已足以支持后续 design / plan / tdd / verify 主线
