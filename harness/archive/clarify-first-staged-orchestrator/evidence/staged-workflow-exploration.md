# Exploration

## Topic

clarify-first staged workflow / single-entry orchestrator / exploration subagents / Claude Code native extension surface

## Date

2026-07-15

## Request Shape

modify

## Candidate Tier

L3

## Owning Module / Domain / Service

- `.claude/skills/`
- `.claude/settings.json`
- `.claude/agents/`
- `harness/templates/`
- `harness/specs/`
- `harness/changes/`
- `harness/plugin/runtime/`

## Codegraph Attempt
- Status: available
- Queries:
  - `How do /harness skill, harness-intake skill, session-start hook, stop hook, and runtime status/start-change commands currently work together as the workflow entry and governance surface? Focus on .claude skills, hooks, runtime cli, and status summary.`
- Key Findings:
  - `/harness` 已明确采用三层模型：`Skill=编排`、`Command=本机/runtime 确定性动作`、`Hooks=自动提醒/阻断/校验`
  - `SessionStart` 当前输出启动检查、当前阶段、静态快照、动态真相、下一步命令，但还没有阶段恢复/下一阶段提示
  - `Stop` 当前消费 freshness 与 handoff guidance，但还没有阶段恢复提示
  - runtime CLI 已形成 backend hub：`start-change`、`status`、`verify`、`doctor` 等
  - 当前 repo 的 Claude Code 原生扩展面已经是 `.claude/skills` + `.claude/settings.json` + `.claude/agents`，外部 `manifest.json` 只是自定义 runtime/adapter contract
- Fallback Reason: null

## Context7 / Documentation Attempt
- Library Name: Claude Code native extension surfaces / superpowers / oh-my-claudecode deep-interview
- Resolved Library ID: not-applicable
- Version: not-applicable
- Query:
  - 通过浏览器查看 `obra/superpowers` 与 `oh-my-claudecode/skills/deep-interview/SKILL.md` 的公开 GitHub 页面，提取 methodology 和 skill 结构信息
- Key Findings:
  - `superpowers` 公开结构清楚地表现为 workflow-first、skills-first、subagent-first 的 methodology 产品
  - 其优势在于：单前门体验、自动提示下一步、planning/TDD/verify/subagent 拆分、shared hooks/skills
  - 其不足是：public repo 更偏 multi-host packaging-first，不适合当前阶段直接照搬
  - `deep-interview` skill 明确强调：一次一个问题、ambiguity scoring、weakest-dimension targeting、先探索再问、显式执行确认、支持中断恢复
- Fallback Reason: 当前环境无法可靠通过 `WebFetch/curl/gh` 访问 GitHub，因此使用浏览器公开页面观察代替；结论基于公开树页与 skill 文件页面可见内容

## Impact Summary
- API: no
- Data: no
- Architecture: yes
- Rule: yes

## Unknowns

- ambiguity scoring 的初版量表
- `review` 是否独立为阶段
- requirements/context/exploration packet 的最小 durable 结构
- 自动推进在阶段切换处的默认交互方式

## Decisions Required

- clarify 是否升级为强制第一阶段
- `/harness` 是否升格为 stage orchestrator
- exploration 是否默认下沉为 read-only subagent 能力
- durable artifact 是否新增 `requirements.md`

## Confidence

高：当前 repo 已经具备 skill/hook/runtime/state 骨架，superpowers 与 deep-interview 的关键思路也已足够清楚，可支撑后续 design 与 tasking。