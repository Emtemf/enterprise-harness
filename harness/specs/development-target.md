---
status: target
owner: enterprise-harness-maintainers
lastVerified: 2026-08-28
implementationRefs:
  - CLAUDE.md
  - skills/harness/SKILL.md
  - skills/design/SKILL.md
  - skills/test-design/SKILL.md
  - skills/plan/SKILL.md
  - skills/implement/SKILL.md
  - skills/verify/SKILL.md
  - skills/archive/SKILL.md
  - runtime/core/
  - runtime/lib/stage-contract.mjs
  - runtime/lib/archive-manifest.mjs
testRefs:
  - test/skill-evals/harness/
  - runtime/test/harness-fact-gate-smoke.mjs
  - runtime/test/workflow-audit-v6-result-smoke.mjs
  - runtime/test/design-compound-gate-smoke.mjs
  - runtime/test/test-cases-downstream-binding-smoke.mjs
---

# Enterprise Harness Development Target

本文件是已经确认的重构目标，供 Claude Code 在每次会话和 compaction 后重新加载。它不是当前实现完成声明；现状以代码、现行 spec 和 fresh evidence 为准。详细 schema、命令与实现行为只在各自权威合同中定义，本文件不复制它们。

## 产品边界

Enterprise Harness 只做 Claude Code 上的企业级软件变更辅助：澄清、设计、计划、隔离实现、独立审查、真实验证与不可变归档。

当前不实现 RAG 平台、意图识别/slot filling、代码反推 PRD 或负知识学习。这些只保留未来能力边界，不得进入当前 lifecycle、artifact、gate 或完成声明。

## 固定生命周期

```text
clarify → design → plan → implement → verify → archive
```

没有 Intake、Classify、Route、TDD 或 Technical Debt 独立阶段。Classification 是 Clarify 内部的持久动作；TDD 是 Task strategy。

每个 Stage 和 Task 都遵循：

```text
execute → self-check → independent review → TECPC audit
→ fresh digest-bound proof → next gate
```

## 职责边界

- Main Harness Skill 是唯一用户对话者，负责 research 编排、问题、用户决策、scope、transition 与恢复。
- Stage Skills 负责方法、supporting resources、工件生成和 self-check。
- Agents 只提供能力、工具、权限和上下文边界。
- Runtime 负责 schema、safe path、state、digest、receipt、decision ledger、proof 与 recovery。
- Hooks 只做 Claude Code 生命周期到 Runtime 的轻量适配，不做需求分析、复杂度判断或总编排。
- 独立 reviewer 使用不同 run 和 fresh context，只读取冻结工件、输入 digest 与 rubric。

## TECPC

TECPC 是横切控制信封，不是五个顺序阶段：

- Target：当前 Stage/Task 的可验证目标，防止偏航。
- Evidence：ResearchPacket、用户决策、artifact、receipt、test report 和 review，防止无证据结论。
- Context：本次执行实际消费的 inputRefs、inputDigests 和 constraints。
- Path：选择的可审计执行路线、公开理由和下一动作，不记录隐藏思维链。
- Correction：block/stale/unsupported 时唯一、具体、可执行的恢复动作；pass 时为 null。

中断、重启或 compaction 后，Runtime 从 durable state、artifact digests、runs、receipts 和 pending decision 重算 TECPC，不从聊天猜测进度。

## Clarify 目标流程

Clarify 一开始就进入事实探索：

1. Main 判断 code/docs lane applicability，形成有依据的 required/not-required 结论。
2. Main 创建并预检 immutable ResearchBrief。
3. 一次性派遣全部 required workers：代码事实 CodeGraph-first；外部版本事实 Context7-first。
4. 等待每个 required lane 的 schema-valid、durable、fresh ResearchPacket。
5. Facts gate 通过后，Main 才建立 component topology 和 Goal/Scope/Constraints/Acceptance/Context 歧义评估。
6. Main 一次只问一个无法由 Agent 获得的业务、范围、兼容或风险 Decision，并提供选项和推荐。
7. 用户与 Main 的重要选择写入 append-only Decision Ledger；不记录隐藏推理、完整聊天或 secrets。
8. Clarify 形成 requirements、技术债处置、project-contract 处置和最终 classification。
9. self-check、独立 review、TECPC 与 fresh ClarifyProof 全部通过后才进入 Design。

## 技术债

Code research 必须识别与当前 change 直接相关的技术债、缺失测试、脆弱边界和升级障碍，并提供代码定位或执行证据；不得借机盘点无关的全仓债务。

每条相关债务由用户选择：`fix-now`、`enabling-task`、`defer`、`accepted-constraint` 或 `not-debt`。发现债务不会自动扩大 scope。CLAUDE.md 只记录债务管理原则和 authority 位置，不保存债务清单。

## 项目长期契约

目标项目的长期 Claude 指令应简洁描述：愿景、做什么/不做什么、技术栈、架构边界、编码规约、构建测试命令、验证标准、安全禁止事项和技术债 authority。

已有 CLAUDE.md 永不整文件覆盖：

- 缺失时生成 proposal，用户批准后创建。
- 已完整时记录 `use-existing`，不写文件。
- 不完整时生成 baseDigest-bound 增量 proposal。
- 冲突时由用户决定，不按模型偏好合并。
- Harness 需要自有内容时，优先由项目 CLAUDE.md 导入短小的 Harness-owned project instructions。
- 不自动修改 CLAUDE.local.md、父目录或组织级 CLAUDE.md。
- apply 前 baseDigest 不匹配必须失败并重新生成 proposal。

## Stage 输出期待

每个 Skill 必须具有可追踪的 Definition of Done：

```text
SKILL.md required flow
→ references/output-contract.md semantic expectations
→ assets template
→ schema
→ deterministic assertions
→ self-check
→ independent review rubrics
→ runtime proof gate
```

Checklist 是上述证据的动态投影，不保存一份可手改的完成清单。Status 每次只显示一个下一 recovery action。

### Clarify

Required research complete/fresh；冲突和 degraded 已处置；相关技术债有用户 disposition；项目指令已审计；所有问题绑定未决 Decision；requirements、scope、acceptance、classification、self-check、review、TECPC 和 ClarifyProof 完整。

### Design

Architecture Design 先完成 Requirement traceability、组件边界、交互/失败路径、适用 API/Data/SQL/migration、安全/并发、兼容/回滚、observability、技术债处置、测试策略、alternatives、self-check 和独立 review；然后 seal，独立 Test Design 以 `VO*` 生成唯一权威 `test-cases.md` 并完成独立 review；最后 runtime 形成 compound DesignProof。该内部顺序不增加 lifecycle stage。

### Plan

Task coverage/dependencies、write/forbidden scope、strategy、exact argv、`tasks.md` 与 `task-commands.json` 绑定、accepted `TC*` mappings、acceptance、rollback、review inputs、self-check、review、TECPC 和 PlanProof 完整。

### Implement

currentTask/handoff/worktree/input digests 匹配；冻结 strategy 真实执行；write scope、receipts、changed paths、TDD 或 migration 证据、self-check、独立 task review、TECPC 和 TaskProof 完整。

### Verify

所有 TaskProof fresh；冻结 unit/integration/contract/migration/applicable E2E 命令真实执行；每个 accepted `TC*` 有 canonical status/receipt，critical E2E 已执行；exit code、report、trace、flaky 状态、final review、TECPC 和 CompletionProof 完整。

### Archive

CompletionProof fresh；requirements→architecture→test-cases→tasks→receipts→reviews 可追踪；Decision Ledger、技术债和 project-contract 处置有引用；ArchiveManifest/attestation 绑定 compound DesignProof 与 Test Design chains、独立 review、TECPC、ArchiveProof 和原子移动完整。

## 实施顺序

一次只攻克一个可验证的垂直闭环：

1. Clarify：research、技术债、project-contract audit、Decision Ledger、Checklist、ClarifyProof。
2. Project-contract 安全 proposal/apply 与 InstructionsLoaded 诊断。
3. Design 输出合同和条件审查。
4. Plan 到 `task-commands.json` 的机器闭环。
5. Implement Task runner/receipt/review/proof。
6. Verify frozen validation runner 和 E2E receipt。
7. Archive/analysis traceability。
8. 标准样例项目中的 Clarify→Archive 全链 E2E。

不得为了兼容未发布或无存量用户的内部草案而保留双重权威；新目标稳定后应删除被替代路径。
