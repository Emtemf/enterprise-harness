# 当前研发快照

更新时间：2026-08-11（0.4.0 released）

本文件仅供维护者继续开发，不是产品合同、安装资产或动态状态真相。

- 当前版本：0.4.0
- 当前阶段：0.4 truth layer + session concurrency + MCP policy + profile/worktree seam（已发布）
- active change：无
- 主干配置包含 Linux/macOS/Windows 与 Node 20/22 matrix；实时结果只以 GitHub Actions 为准

## 0.3.2 路径重构的遗留漂移（0.3.8 修复）

`harness/plugin/runtime/` → `runtime/`（0.3.2）声称更新了 120+ 处引用，实际漏掉四类
非 import 引用，均在 0.3.8 修复：

- `.gitignore` 仍指旧路径，导致本机运行标记 `runtime/.bootstrap-ran` 被跟踪并打进发布包
- `bin/package.mjs` 白名单未排除该标记
- `artifact-content-smoke` 中用于排除测试目录的正则仍写旧路径，断言恒真通过
- 三个 CI workflow 共 8 处脚本路径未改，CI 自 0.3.2 起连续 20 次全红

## 0.3.9 改名与守卫补齐

- `harness-intake` → `harness-clarify`：skill 名与 clarify 阶段一致，纯改名 16 处引用。
- 新增 `skill-registry-contract-smoke`：断言 name/dir 一致、无孤儿、无幽灵引用。
- `checks.mjs` 必需路径补齐 `harness-route`、`harness-stage-executor`、`harness-stage-checker`。
- `plugin-entry-agent-contract` 区分用户 skill 和 worker skill（`user-invocable: false`）。
- CI workflow 路径修复 + `ci-workflow-contract-smoke` 守卫。
- `ossf/scorecard` 改为仅公开仓库运行。

## 0.3.10 阶段 skill 上下文隔离

- route/design/plan/tdd/verify 加 `context: fork` + `background: false`：阶段 SOP 全文不再进主对话。此前跑完整条链会在主上下文堆叠 7 份阶段合同。
- `harness` 与 `harness-clarify` 保持 inline：forked subagent 没有用户对话通道，而 clarify 的核心行为是一次只问一个问题。
- route 原第 4 步"向用户展示并请其确认路由"移回主 orchestrator；forked route 只返回待确认项，`workflow.routeReady` 不由该 skill 置位。
- 除入口外全部 stage skill 加 `user-invocable: false`，兑现"唯一入口"。此前 `/harness-design` 等可直接跳进去绕过 gate。
- `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=3` 写入 `bin/generate-hooks.mjs`（`.claude/settings.json` 是生成物，手改会被 `hook-manifest-parity-smoke` 判 stale）。
- fork 内治理链已实测：探针 skill 在 fork 中写受治理路径被 `pre-write.mjs` BLOCK，文件未生成；nested `Agent` 派发可用，cwd 解析到仓库根。静态 frontmatter 断言不覆盖这条，需要实跑。
- 深度不足改为 fail-loud：`runtime/lib/spawn-depth.mjs` 求值 → doctor 在 depth<2 判 fail、未设置判 warn，session-start 报 `EH-SPAWN-DEPTH-020`。`.claude/settings.json` 按 `harness/specs/architecture.md` 属开发通道、刻意不进发布包，所以发布通道靠 runtime 侧检测覆盖，而非扩白名单。
- `dependency-review` 按仓库可见性 gate：私有仓库缺 dependency graph，该 job 每个 PR 必然失败，与 `ossf/scorecard` 是同一种"把红当正常"的模式。`ci-workflow-contract-smoke` 的可见性断言同时改为按 job 作用域，此前整文件正则会让一个已 gate 的 job 替未 gate 的 job 背书。

### 已知缺口

- Context7 仍走 CLI（`runtime/context7.mjs` + doctor/sync/registry/launcher smoke），未改 MCP。这是刻意设计，非缺陷。

## 0.3.14 Hook 瘦身 + 阶段链验证 skill 驱动（KISS 重构）

### 问题

hook 太厚、每次写文件全量重算静态阶段链（ambiguity/router/design/plan/codegraph），
token 浪费且与 skill 职责重叠。此前只做了代码位置移动（hook→lib），触发机制没变——「歪了」。

### 架构变更：静态阶段链由 skill 驱动，hook 只留瞬间 gate

```
plan freeze ──→ enterprise-harness validate（新 CLI）──→ evidence/stage-gate.json marker
                                                              │ digest 只覆盖静态证据
tdd 写代码 ──→ pre-write hook ──→ ① 动态瞬间 gate（agent 绑定 tdd-executor / RED / currentTask）
                                    ② marker 存在 + digest 匹配（轻查，不重算阶段链）
                                    ③ marker 缺失/过期 → block，提示先跑 validate
```

- **hook 薄壳化**：12 个 hook 从 925 行降到 ~185 行；stdin 解析统一走
  `runtime/lib/hook-input.mjs`；策略函数在 `runtime/lib/hooks/*.mjs`（返回
  `{exitCode, stdout, stderr}`），可单测、好定位。
- **`validateStageChain`**（原 `validateExecutionPrerequisites` 拆分）：只依赖已批准的
  静态证据，由 `validate` CLI 在 plan freeze 后、tdd 开始前验证一次，落 marker。
- **`validateDynamicWriteGates`**：agent 归属 / RED / currentTask，每次写受治理路径当场查。
- **marker digest 只覆盖** requirements/change/design/tasks + reviews/*，**刻意排除**
  state 动态字段（currentTask/redVerified）与 evidence/tdd receipts —— tdd 中途写证据
  不误伤 marker；改 plan/reviews 才使 digest 失效、必须重新 validate。
- **skill 更新**：`harness-plan` freeze 后调 `validate`；`harness-tdd` 步骤 0 前置 validate。

### 测试调整

- 阶段 gate 测试（ambiguity/router）改指 `validate` CLI；pre-write 测试保留 12 个 fail-closed
  场景，H/K 改指 validate。
- `cumulative-write-gate` 端到端：validate 落 marker → pre-write 放行 → 删除 plan-critic
  → digest mismatch → block → 恢复 + revalidate → 放行。
- 4 个扫描 hook 源码的测试（dedup guard、recommendNextEntry、completion predicate 等）
  扫描目标从 `runtime/hooks/` 改到 `runtime/lib/hooks/`。
- 全量 115 smoke 绿，release verify 绿，打包含 validate.mjs 与全部 lib/hooks。

### 遗留

当前 change `EH-WORKFLOW-TECPC-20260806` 在 tdd 阶段但缺 `codegraph-attempt` ledger
（历史 clarify 用旧 hook，CodeGraph 查询未落账），`validate` 因此 block。按「不兼容历史」
决策（无实际用户）保留严格行为；该缺口正是本 change 要修的 CodeGraph-first 契约缺陷本身。
该 change 已于 0.3.18 归档（见 0.3.18 小节）。

## 0.3.16 clarify 合并进 harness + 认知负载清理

### 问题

`harness-clarify` 独立存在导致认知负载：harness 入口引用它，两个 skill 管同一份 clarify
SOP，割裂。用户明确「既然 clarify 合并了就不要出现了」。同时按 Claude Code 官方 skill
规范核对：一个 skill 应聚焦一个领域，确定性逻辑放 skill 的 `scripts/` 子目录而非塞进
SKILL.md 正文。

### 改动

- 删除 `harness-clarify` skill 目录，clarify SOP（design-tree/frontier 机制、探索顺序、
  执行流、七维）并入 `harness` skill 的 clarify 小节。harness 是唯一入口，不再引用独立
  clarify skill。
- `workflow.mjs` 的 clarify `nextEntry` 从 `/harness-clarify` 改为 `/harness`；
  `start-change.mjs` 提示同步；`checks.mjs` 必需路径、`plugin.json` skills 列表、
  `upstream/registry.json`、`specs/agents-and-handoff.md`、`specs/upstream-mapping.md`、
  `specs/stage-observability.md`（时序图 participant C→M、角色表）全部移除 harness-clarify。
- 相关测试（plugin-entry-agent、subagent-contract、ambiguity/router/session-log/
  recommend-next-action/workflow-next-entry）的目录存在性检查与 nextEntry 断言更新。
- 全量 115 smoke 绿。

### 遗留

skill `scripts/` 迁移已否决（用户判断：skill 只引用 runtime CLI 不重复实现已合规，
过度抽 scripts/ 反而增加认知负载）。

## 0.3.17 skill 指令化：删解释、补 codegraph 用法

### 问题

harness skill 正文夹带大量「解释为什么」：为什么不 fork、设计树/frontier 概念定义、
「探索是你的职责」等。这些是背景知识不是可执行指令；官方规范要求
「Only add context Claude doesn't already have」+ 正文做导航。同时代码探索用 codegraph
MCP 的用法只写在 code-explore agent 定义里，harness 没把它传给 orchestrator。

### 改动

- harness/SKILL.md 从 173 行降到 112 行：删除「为什么不 fork」「设计树/frontier 定义」
  等解释段，保留可执行步骤。
- 补「代码探索」指令：派 `enterprise-harness:code-explore`，它对符号/调用链/影响面使用
  codegraph MCP（`codegraph_explore`/`search`/`callers`/`callees`/`impact`），codegraph
  不可用才 fallback 到 grep/Read；主对话不直接 grep。
- 保留被测试守护的核心约束（worktree 只提供文件隔离、subagent 提供上下文隔离）。
- 各 stage skill（route/design/plan/tdd/verify）已是指令式，仅保留必要的「上下文边界」
  约束，无需改动。
- 全量 115 smoke 绿。

## 0.3.18 归档 minimum-discovery change + WorktreeRemove hook

### 归档

`EH-WORKFLOW-TECPC-20260806`（minimum-discovery 探索性 change）历史证据链断裂（早期
半截 handoff：clarify.synthesize/route.decide/design.produce 缺有效 checker pass），
audit block。其 scope（harness governance breaking redesign）已被实际代码重构替代——
hook 瘦身、validate CLI、clarify 合并都是它的产物，使命已完成。按用户决策归档
（`lifecycle archive --force`），不再修复推进。

### WorktreeRemove hook

根因：`createWorktree` 把 active change 快照 `cpSync` 进 worktree，产生 untracked 改动，
Claude Code 自动清理判定「有改动」永不触发，worktree 残留（实测 55 个）。修复：新增
`WorktreeRemove` hook（fail-open 副作用清理），事件触发时删除 worktree 里 harness/ 镜像
（主仓库有权威副本），保留 agent 真实代码改动供人工恢复。manifest/settings.json/hooks.json
注册，hook-dedup-guard EXEMPT 加 worktree-remove（幂等）。

## 0.3.19 skill 分层 + agent 路径协议（认知负载清理）

### 问题

skill 全部内容塞在单个 SKILL.md（行为表、契约模板、示例全混），无分层；
15 个 agent 硬编码裸文件名（`requirements.md`、`design.md` 等），不知道从哪个 change 目录读取，每次需求对应的文件路径会变却无法动态定位；
smoke 测试缺对 `requiredPaths()` 与磁盘 skill 目录同步的双向校验，导致之前出现的漂移问题无法及时发现。

### 改动

**skill 子目录结构化**：
- `harness/refs/behavior-map.md`：behavior 速查表从 SKILL.md 提取（stage.action 正确写法）
- `harness/refs/stage-decisions.md`：阶段推进决策表从 SKILL.md 提取
- `harness-stage-executor/refs/result-contract.md`：HANDOFF_RESULT 输出合同独立文件
- `harness-stage-executor/examples/minimal.md`：execute/blocker 最小完整示例
- `harness-stage-checker/refs/verdict-contract.md`：checker verdict 合同独立文件
- `harness-stage-checker/examples/verdicts.md`：pass/block/advisory 三种示例
- 三个 SKILL.md 瘦身（131→104、97→40、93→30 行），重内容移至 refs/examples

**agent 动态路径修复（全部 15 个 agent）**：
- 7 个 reviewer：`HANDOFF_INPUT → inputRefs → 完整路径`，禁止裸文件名
- 4 个 executor（synthesizer/design-executor/plan-executor/route-decider）：新增输入协议段
- 4 个剩余 agent（code-explore/doc-research/tdd-executor/verification-executor）：明确 `inputRefs` 路径格式 `harness/changes/<changeId>/<artifact>` 和产出路径

**守卫**：
- 新增 `runtime/test/required-paths-skills-sync-smoke.mjs`：双向校验 `requiredPaths()` 中 harness* 条目与磁盘实际 skill 目录是否完全同步，任何漂移在 CI 立即 FAIL
- 删除废弃 stub `.claude/skills/harness-clarify/`（0.3.16 已合并入 harness，stub 让 skill-registry-contract-smoke 失败）

### 判据

- `skill-registry-contract-smoke` PASS（8 skills）
- `required-paths-skills-sync-smoke` PASS（8 harness skills in sync）
- 全量 smoke suite 绿

## 0.4.0 breaking redesign（已发布）

已落地并进入发布前验证：

- controller/subject common-dir 边界、State v5 envelope、session binding、change lock 和 stale recovery。
- requirements/design/plan/evidence/validation dependency invalidation 与 controlled rewind。
- research packet、CodeGraph/Context7 alias policy、digest-bound waiver、archive/abandon 语义。
- session 优先的 current-change resolution；`ACTIVE_CHANGE` 仅保留无 session 环境的兼容 fallback。
- `harness/project.json` profile v1，集中 Java/Maven 与受治理路径边界。
- Claude Code native `worktree.baseRef=head` 配置投影；现有 custom worktree hooks 暂保留兼容测试覆盖，后续版本再移除。
- route 确认现在会持久化内部 classification 到 state root 与 workflow projection；`routeReady` / `/harness-route` 仍作为兼容入口。
- classify 已增加为内部 action：输出 tier、impact、requiredReviews 和固定 workflow topology；route 兼容 stage 暂未删除。

尚未在本次 0.4.0 release 中完成的后续 breaking cleanup：

- route 从用户可见 stage 收敛为内部 classify action。
- 9 Skill / 5 Agent surface 的完整合并，以及 custom worktree hook 的最终删除。
- 实际外部 CI 结论与 nightly Claude eval。


动态状态只读取：

```text
<git-common-dir>/enterprise-harness/sessions/<session-id>.json
harness/changes/<change-id>/state.json
```

无 session 环境才读取兼容指针：

```text
harness/ACTIVE_CHANGE
```

完成本轮后应刷新 active change evidence，再由 completion predicate 决定 verify/archive。
