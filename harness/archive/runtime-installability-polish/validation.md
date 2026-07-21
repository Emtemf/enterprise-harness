# Validation

## Source Digest

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `hooks/hooks.json`
- `README.md`
- `docs/zh-cn/installation-guide.md`
- `docs/zh-cn/overview.md`
- `AGENTS.md`
- `harness/plugin/runtime/ONBOARDING.md`
- `harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs`
- `harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs`
- `harness/plugin/runtime/test/harness-stage-router-smoke.mjs`
- `harness/plugin/runtime/cli.mjs`

## Artifact Digest

- active change: `harness/changes/runtime-installability-polish/`
- current state before final state refresh: clarify/discovery/stale（旧状态）
- target state after收口: `VALIDATED` + `workflow.stage=archive` + `validation.status=fresh`

## Commands Executed

- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify`
- `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`

## Clarify / Requirements Confirmation

- 用户明确要求优先直接补 durable change 资产，而不是继续散改代码
- 当前收口标准：让小白用户可以没有认知负载地使用我们
- 对普通用户的当前主路径定义为：
  1. 获取仓库
  2. 通过 Claude Code 本地 marketplace 安装 `enterprise-harness`
  3. 进入 Claude Code 会话后直接从 `/harness` 开始
- 当前不把“已发布到公共 marketplace / npm registry”写成完成事实

## Unit Tests

- 不适用；本轮以 deterministic smoke 为主。

## Unit Coverage

- 不适用。

## Architecture Tests

- 不适用；本轮不涉及 Java 分层或业务架构改动。

## Integration Tests

1. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-installability-smoke.mjs verify`
   - Result: 通过
   - Covers:
     - plugin validate
     - marketplace validate
     - marketplace add
     - plugin install
     - plugin list
     - marketplace update
     - plugin update

2. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/runtime-plugin-docs-smoke.mjs verify`
   - Result: 通过
   - Covers:
     - README plugin-first 文案
     - installation-guide update 路径
     - overview plugin-first 定位
     - AGENTS plugin marketplace 入口

3. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/test/harness-stage-router-smoke.mjs verify`
   - Result: 通过
   - Covers:
     - `/harness` 仍是 clarify-first staged workflow 的统一入口
     - design/plan/tdd/verify stage skill skeleton 仍存在

## Backend API E2E

- 不适用。

## OpenAPI Contract

- 不适用。

## Google Java Style

- 不适用。

## Repo Contract Verify

1. `node /home/wula/IdeaProjects/sdd/harness/plugin/runtime/cli.mjs verify --json`
   - Result summary:
     - `ok = true`
     - `contractChecks.ok = true`
     - `contractChecks.problems = []`
     - `runtimeReadinessChecks.status = not-run`
   - Interpretation:
     - 本轮 change 资产补账没有破坏 repo contract checks
     - `runtimeReadinessChecks` 当前只是 guidance，不构成本 change 完成阻断

## Review Verdicts

- `requirement-reviewer`: advisory
- `design-reviewer`: pass
- `plan-critic`: pass
- `verification-reviewer` Task 1: advisory（已确认 installability 证据充分，但指出 durable state / validation 台账未同步）
- `verification-reviewer` Task 2: pass

## Stage Gate Summary

- clarify: complete
- design: pass
- plan: pass
- tdd: task-level evidence complete for Task 1/2；Task 3 为 durable 收口任务
- verify: pass（在当前 change 边界内）
- archive: ready after state refresh

## Skipped Checks

- plugin install 后 hooks 的真实运行时触发 E2E：本轮未覆盖，后续若继续产品化 plugin 体验，应单开 change 补充
- 公共 marketplace / npm registry 发布：本轮明确不宣称

## Failures and Retries

- 本轮先前执行 `runtime-plugin-docs-smoke.mjs verify` 时，曾暴露：
  - README 缺少 `node bin/enterprise-harness.mjs <command>` fallback
  - overview 的精确 plugin-first 定位字符串不匹配
- 以上问题已通过最小文档修正收口后转绿
- design review 过程中进一步暴露：
  - `harness/plugin/runtime/ONBOARDING.md` 仍像普通用户主文档
  - `/harness` 单入口合同未被显式纳入本 change testing strategy
- 本轮已把 `ONBOARDING.md` 降级为 maintainer appendix，并补充 `harness-stage-router-smoke.mjs verify` 为 fresh evidence

## Final Verdict

- 当前 change 已具备以下可以诚实宣称的完成事实：
  - Claude Code **本地 marketplace install/update** 路径已可用
  - 普通用户文档已收口为：安装插件后直接从 `/harness` 开始
  - maintainer / operator / 排障路径已与普通用户路径分层
  - `/harness` 单入口合同仍有 smoke 证据支撑
  - repo-level contract verify 保持通过
- 当前 change 不能宣称的内容：
  - 公共 marketplace 已发布
  - npm registry 发布闭环已完成
  - plugin install 后 hooks runtime trigger 已端到端验证
