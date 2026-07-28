# Tasks

Status: finalized-plan

## Role Ownership

- 主导：隔离 worktree 中的 `enterprise-harness:tdd-executor`
- 主 orchestrator：只负责串行派发、receipt import、cherry-pick、集成复验
- Review：每 task 独立 code review；最终 verification review
- active change：`plugin-runtime-agent-dispatch-hardening`
- clarify-ready：true
- design-approved：true
- plan-critic：pass

## 全局执行与集成协议

四个 task 严格串行。Task N 只有在 Task N-1 的 commit 已集成并复验后才可派发。

每个 executor 必须返回：

- task id、agent id/type
- worktree absolute path、git common dir
- RED/GREEN/REFACTOR receipt refs
- implementation commit SHA
- changed paths
- commands 与 exit summary

主 orchestrator 对每个 task 固定执行：

```bash
git cherry-pick <executor-commit-sha>
# 派独立 reviewer 只读审查已集成 diff；主 orchestrator 仅把原样 verdict
# 写入 reviews/code-reviewer-taskN.json，并与后续 imported evidence 一起提交
node harness/plugin/runtime/cli.mjs evidence-import \
  plugin-runtime-agent-dispatch-hardening <task-id>
node harness/plugin/runtime/test/<task-aggregate-smoke>.mjs verify
```

机械顺序是 `executor commit → cherry-pick → independent task review → verdict 落盘 →
evidence-import → aggregate verify → main evidence/review commit`。reviewer 不得在 executor
worktree 预写 pass；主 orchestrator 只能持久化 reviewer 的原样结论，不能替 reviewer 判定。
任一命令或 verdict 失败：停止，不派下一个 task，不手写 receipt。executor worktree基于
“上一个 task 已完成 main evidence/review commit 的 HEAD”创建；不得从旧 default branch 猜基线。

### Runner bootstrap 规则（只允许 Task 1）

Task 1 创建 authoritative runner 本身，存在不可消除的 self-hosting 边界。它必须先创建
test-only `bootstrap-tdd-run.mjs`（只负责 `spawnSync(..., shell:false)`、exit/time/output
digest 与 worktree metadata），再用它记录 Task 1 的真实 RED→GREEN→REFACTOR。bootstrap
receipt 标记 `provenance=runner-bootstrap`，只在同时满足以下条件时可导入：

- `tasks.md` 仅 Task 1 声明 `runner-bootstrap`；
- receipt 保存 bootstrap script path、sha256、Node version；import 在 cherry-pick 后重新计算
  当前已评审脚本 digest，任何不一致都拒绝；
- RED 非零、GREEN/REFACTOR 为零且时间单调；
- 独立 task reviewer verdict=pass；
- receipt 的 changed paths 只覆盖 Task 1；
- 之后任何 task 禁止 bootstrap provenance，必须使用正式 `tdd-run`。

这不是 legacy state 降级；completion predicate 只对“实现 runner 自身的首个 task”识别该
受限 receipt kind。

## Allowed argv matrix

正式 runner 只接受下表 literal child argv。每个 task 的三阶段命令与 import 命令均已固定：

| Task | Phase | Child argv |
|------|-------|------------|
| task-1 | RED | `node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs red` |
| task-1 | GREEN | `node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs green` |
| task-1 | REFACTOR | `node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs verify` |
| task-2 | RED | `node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs red` |
| task-2 | GREEN | `node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs green` |
| task-2 | REFACTOR | `node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs verify` |
| task-3 | RED | `node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs red` |
| task-3 | GREEN | `node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs green` |
| task-3 | REFACTOR | `node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs verify` |
| task-4 | RED | `node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs red` |
| task-4 | GREEN | `node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs green` |
| task-4 | REFACTOR | `node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify` |

Task 2–4 的 exact wrapper 形式均为：

```bash
node harness/plugin/runtime/cli.mjs tdd-run \
  plugin-runtime-agent-dispatch-hardening <task-id> <red|green|refactor> -- \
  node harness/plugin/runtime/test/<task-aggregate-smoke>.mjs <red|green|verify>
```

然后 executor commit，主 orchestrator cherry-pick，再执行：

```bash
node harness/plugin/runtime/cli.mjs evidence-import \
  plugin-runtime-agent-dispatch-hardening <task-id>
```

## Task 1: authoritative evidence foundation（runner-bootstrap）

**Files**

- Create: `harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs`
- Create: `harness/plugin/runtime/lib/evidence-policy.mjs`
- Create: `harness/plugin/runtime/lib/agent-evidence.mjs`
- Create: `harness/plugin/runtime/lib/tdd-receipts.mjs`
- Create: `harness/plugin/runtime/tdd-run.mjs`
- Create: `harness/plugin/runtime/evidence-import.mjs`
- Create: `harness/plugin/runtime/migrate-evidence-policy.mjs`
- Create: `harness/plugin/runtime/hooks/pre-agent.mjs`
- Create: `harness/plugin/runtime/hooks/post-agent.mjs`
- Create: `harness/plugin/runtime/hooks/subagent-start.mjs`
- Create: `harness/plugin/runtime/hooks/subagent-stop.mjs`
- Create: `harness/plugin/runtime/test/tdd-receipt-contract-smoke.mjs`
- Create: `harness/plugin/runtime/test/evidence-policy-contract-smoke.mjs`
- Create: `harness/plugin/runtime/test/agent-lifecycle-hook-smoke.mjs`
- Create: `harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs`
- Modify: `harness/plugin/runtime/cli.mjs`
- Modify: `harness/plugin/runtime/migrate.mjs`
- Modify: `harness/plugin/runtime/upgrade.mjs`
- Modify: `harness/templates/state.json`
- Modify: `hooks/hooks.json`
- Modify: `.claude/settings.json`

**Consumes**

- design 的 spool/import schema、Post Agent `agentId` binding、sealed baseline policy

**Produces**

- 正式 `tdd-run` / `evidence-import`
- dispatch/start/stop/Post Agent shared ledger
- 一次性 sealed policy migration

**Test-first Order**

1. 写三个 component smoke 与 aggregate smoke。
2. 用 bootstrap runner 执行 Allowed argv task-1/RED，必须 exit≠0。
3. 实现最小 GREEN；bootstrap runner 执行 task-1/GREEN，必须 exit=0。
4. 只抽 digest/git helper；执行 task-1/REFACTOR，必须 exit=0。
5. commit 后返回 bootstrap receipt + SHA；主 orchestrator import 并复验 aggregate。

**Exact bootstrap commands**

```bash
node harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs \
  plugin-runtime-agent-dispatch-hardening task-1 red -- \
  node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs red
node harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs \
  plugin-runtime-agent-dispatch-hardening task-1 green -- \
  node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs green
node harness/plugin/runtime/test/support/bootstrap-tdd-run.mjs \
  plugin-runtime-agent-dispatch-hardening task-1 refactor -- \
  node harness/plugin/runtime/test/task1-authoritative-evidence-smoke.mjs verify
```

**Acceptance Checks**

- [ ] official runner 使用 argv + `shell:false`
- [ ] bootstrap receipt 绑定 script sha256/Node version，import 复算一致
- [ ] RED/GREEN/REFACTOR exit/顺序/时间/digest/worktree 均机械校验
- [ ] spool 在 git common dir，import 原子且绑定 integration HEAD
- [ ] dispatch 以 Agent PostToolUse `tool_use_id + agentId` 绑定并发 start
- [ ] current official scoped observed type 可用，logical observed type 只作兼容归一且保留 raw
- [ ] policy registry 只能创建一次，baseline/seal/legacy 历史存在性可验证
- [ ] migrate/upgrade 接入 policy migration

**Review Target**

- `reviews/code-reviewer-task1.json`

## Task 2: canonical entry、scoped dispatch 与 portable launcher

**Files**

- Delete: `.claude-plugin/commands/harness.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `bin/enterprise-harness.mjs`
- Modify: `.claude/skills/harness/SKILL.md`
- Modify: `.claude/skills/harness-intake/SKILL.md`
- Modify: `.claude/skills/harness-design/SKILL.md`
- Modify: `.claude/skills/harness-plan/SKILL.md`
- Modify: `.claude/skills/harness-tdd/SKILL.md`
- Modify: `.claude/skills/harness-verify/SKILL.md`
- Modify: `.claude/rules/10-code-analysis.md`
- Modify: `.claude/agents/tdd-executor.md`
- Create: `harness/plugin/runtime/test/plugin-entry-agent-contract-smoke.mjs`
- Create: `harness/plugin/runtime/test/portable-launcher-smoke.mjs`
- Create: `harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs`

**Consumes**

- Task 1 正式 runner/ledger
- standalone 与 plugin canonical entry contract

**Produces**

- plugin skill 唯一入口
- known Agent tool scoped subtype，无 general-purpose fallback
- executor `isolation: worktree`
- 从 plugin install root 定位 runtime、以 target cwd 执行的 launcher

**Literal launcher interface**

plugin-installed skill 使用同一段确定性 Bash：

```bash
if command -v enterprise-harness >/dev/null 2>&1; then
  enterprise-harness <subcommand> [args...]
elif test -f harness/plugin/runtime/cli.mjs; then
  node harness/plugin/runtime/cli.mjs <subcommand> [args...]
else
  echo "BLOCK: enterprise-harness launcher unavailable; reload/update the plugin" >&2
  exit 2
fi
```

- plugin 模式第一分支：Claude Plugins 官方 “Plugin structure overview” 明确 plugin root
  `bin/` executable 会加入 Bash PATH；launcher 用
  `fileURLToPath(import.meta.url)`/自身目录推导 install root，再执行
  `<install-root>/harness/plugin/runtime/cli.mjs`，child `cwd=process.cwd()` 保持 target cwd。
- standalone source checkout 第二分支：直接运行 target repo 自带 runtime。
- 禁止用 `${CLAUDE_PLUGIN_ROOT}` 作为模型 Bash 的隐含前提；该变量仅在 hook command 配置中使用。
- deterministic `portable-launcher-smoke` 在 temp target 将 source `bin/` 显式放入 PATH，执行
  `enterprise-harness start-change launcher-probe codex L1 launcher-probe`，断言 change
  只创建于 temp target，source plugin tree 未被写入；再移除 PATH 验证 standalone fallback。
  该 smoke 只验证 launcher 自身，不冒充宿主 PATH 证明。
- 宿主 PATH 由 Task 4 authenticated plugin-only E2E 验收：不得为 enterprise-harness 手工
  注入 PATH；进入 skill 后首个 backend probe 必须执行
  `command -v enterprise-harness && enterprise-harness --help`，任一失败则 live E2E 非零退出。

**Exact phase commands**

```bash
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-2 red -- node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs red
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-2 green -- node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs green
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-2 refactor -- node harness/plugin/runtime/test/task2-plugin-agent-smoke.mjs verify
```

**Acceptance Checks**

- [ ] 无 command/skill collision
- [ ] plugin canonical `/enterprise-harness:harness`，standalone `/harness`
- [ ] Agent dispatch 全 scoped，logical lane/reviewer id 不变
- [ ] 无 `general-purpose` fallback
- [ ] launcher script path 相对 `import.meta.url`，target state 相对调用 cwd
- [ ] plugin skill 先 `command -v enterprise-harness`，缺失时 BLOCK；standalone 才走本地 Node fallback

**Review Target**

- `reviews/code-reviewer-task2.json`

## Task 3: cumulative agent-aware gates 与 completion/archive

**Files**

- Create: `harness/plugin/runtime/lib/execution-prerequisites.mjs`
- Create: `harness/plugin/runtime/lib/hook-targets.mjs`
- Create: `harness/plugin/runtime/test/cumulative-write-gate-smoke.mjs`
- Create: `harness/plugin/runtime/test/archive-completion-smoke.mjs`
- Create: `harness/plugin/runtime/test/task3-gate-completion-smoke.mjs`
- Modify: `harness/plugin/runtime/hooks/pre-explore.mjs`
- Modify: `harness/plugin/runtime/hooks/pre-write.mjs`
- Modify: `harness/plugin/runtime/hooks/post-write.mjs`
- Modify: `harness/plugin/runtime/hooks/stop.mjs`
- Modify: `harness/plugin/runtime/lib/gates.mjs`
- Modify: `harness/plugin/runtime/lib/checks.mjs`
- Modify: `harness/plugin/runtime/lifecycle.mjs`
- Modify: `harness/plugin/runtime/verify.mjs`
- Modify: `hooks/hooks.json`
- Modify: `.claude/settings.json`

**Consumes**

- Task 1 policy/receipt/identity
- Task 2 scoped agent surface

**Produces**

- main-thread exploration/write denial
- per-agent CodeGraph attempt before fallback
- stage-independent cumulative prerequisites
- verify/stop/archive shared completion predicate

**Exact phase commands**

```bash
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-3 red -- node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs red
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-3 green -- node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs green
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-3 refactor -- node harness/plugin/runtime/test/task3-gate-completion-smoke.mjs verify
```

**Acceptance Checks**

- [ ] main business exploration 永远不因手填 state 解锁
- [ ] code-explore fallback 绑定同 agent CodeGraph attempt
- [ ] Write/Edit/NotebookEdit 与常见 Bash write 均解析
- [ ] stage=tdd 不能跳过 clarify/route/design/plan/review
- [ ] production/OpenAPI 写入要求 task-scoped RED receipt
- [ ] archive 失败无 state/目录/ACTIVE_CHANGE 副作用
- [ ] legacy 只豁免 provenance，fresh digest/reviewer/impact 仍强制

**Review Target**

- `reviews/code-reviewer-task3.json`

## Task 4: version/release acceptance 与 clean-target live E2E

**Files**

- Modify: `.claude-plugin/marketplace.json`
- Modify: `bin/release.mjs`
- Modify: `harness/plugin/runtime/prepublish.mjs`
- Modify: `harness/plugin/runtime/verify.mjs`
- Modify: `.github/workflows/platform-smoke.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`
- Create: `harness/plugin/runtime/test/release-version-acceptance-smoke.mjs`
- Create: `harness/plugin/runtime/test/claude-plugin-live-e2e.mjs`
- Create: `harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs`

**Consumes**

- Tasks 1–3 deterministic gates
- portable launcher 与 Claude `--plugin-dir`/stream-json

**Produces**

- package/manifest/plugin/marketplace root+entry 一致版本
- prepublish/release blocking P0 smoke
- authenticated clean-target live proof

**Exact phase commands**

```bash
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-4 red -- node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs red
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-4 green -- node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs green
node harness/plugin/runtime/cli.mjs tdd-run plugin-runtime-agent-dispatch-hardening task-4 refactor -- node harness/plugin/runtime/test/task4-release-acceptance-smoke.mjs verify
```

**Clean-target live fixture**

1. `mkdtemp` + `git init`，创建最小 `src/main/java/demo/App.java`。
2. 用绝对 source CLI 在 temp cwd 执行：
   `node <repo>/harness/plugin/runtime/cli.mjs start-change live-probe codex L1 live-probe`。
3. 写入 fixture requirements/design/tasks/reviews/state，使 explore gate 可进入；不复制本仓库
   `.claude/agents` 或 runtime。
4. temp `PATH` 只追加返回 unavailable 的可控 `codegraph` fixture，不得追加 source plugin
   `bin/`；enterprise-harness 必须完全由 Claude plugin host 注入。
5. 从 temp cwd 执行 `claude --plugin-dir <repo> -p <prompt> --output-format stream-json --verbose`，
   prompt 显式调用 `/enterprise-harness:harness` 并派
   `enterprise-harness:code-explore`。
6. 断言 `command -v enterprise-harness` 成功、portable `--help` 成功、stream-json Skill/Agent、
   target git-common-dir ledger scoped Start/Stop/agentId binding。
7. 将 sanitized summary 写到
   `harness/changes/plugin-runtime-agent-dispatch-hardening/evidence/live-e2e.json`。

环境语义：

- `HARNESS_LIVE_E2E` 未设置：输出 `SKIP ...`，exit=0；不写 pass evidence。
- `HARNESS_LIVE_E2E=1`：Claude 缺失、未认证、Skill/Agent/ledger 任一断言失败均 exit≠0。
- 本机最终 verify 必须以 `HARNESS_LIVE_E2E=1` 运行；CI 无凭据只允许明确 SKIP。

**Acceptance Checks**

- [ ] 当前五处 projection 均为 `0.2.29`
- [ ] release bump 同步所有 projection
- [ ] release 在 commit/tag/package/push 前运行 prepublish
- [ ] `claude plugin validate .` 零 warning
- [ ] deterministic P0 在 platform/release workflow blocking
- [ ] authenticated local live E2E 有 durable sanitized evidence
- [ ] 不执行 release/tag/push

**Review Target**

- `reviews/code-reviewer-task4.json`

## Plan Exit Criteria

- [x] `plan-critic` verdict=pass
- [x] header 改为 `# Tasks`
- [x] `workflow.planReady=true`、state=`TASKED`
- [ ] 四个 task 串行 worktree、commit、import、cherry-pick、集成复验
