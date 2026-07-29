---
name: harness-tdd
description: >
  Clarify-first staged workflow 的 TDD 执行阶段入口。用于在 plan 已明确后，严格执行 TEST_WRITTEN -> RED_VERIFIED -> GREEN_VERIFIED -> REFACTOR_VERIFIED，并保留 durable evidence。适用于“按 TDD 开始执行”“验证 RED/GREEN/REFACTOR”“准备进入 verify 阶段”等场景。
---

# Harness TDD

plugin-only 环境从 `/enterprise-harness:harness` 进入后会路由到本阶段；standalone source checkout 继续使用裸 `/harness` 与阶段恢复入口。

## 目标

本阶段默认以 **Fullstack Developer 视角**主导，并让 **Quality Engineer** 参与验证 RED/GREEN/REFACTOR 证据。

重点不是“写点测试”，而是让开发与测试围绕同一组证据推进实现。

## 默认执行面

- 只要目标项目存在真实构建/测试命令，TDD 默认应下沉给专职 worker / subagent 执行 RED/GREEN/REFACTOR，而不是把所有执行细节堆在主对话里
- `/harness-tdd` 的职责是阶段编排与结果消费，不是替代 executor 承担完整执行细节
- 主上下文只保留 receipt refs、implementation commit、review verdict、失败原因与下一步决策


## 前置条件

进入本 skill 前，至少应满足：

- `tasks.md` 已准备好
- touched files 与 test-first order 已明确
- 当前 change 已达到可执行准备态
- 已读取当前项目的 `CLAUDE.md` / 项目根事实，确认真实构建与测试命令（例如 Maven / Gradle / npm / pytest），不得拿 harness 仓库自己的 verify 命令冒充目标项目构建验证

## TDD 子状态

```text
TEST_WRITTEN
→ RED_VERIFIED
→ GREEN_VERIFIED
→ REFACTOR_VERIFIED
```

## 核心规则

- 没有 RED 证据，不得修改生产代码
- 没有 GREEN 证据，不得宣称实现完成
- REFACTOR 只能在全绿后进行
- 所有阶段都必须留下可进入 `validation.md` 的命令与结果摘要

## 【硬约束】必须使用 subagent 执行 TDD

**【强制】TDD 阶段的每个 task 必须通过 Agent 工具派遣 subagent 执行，不得在主对话中直接写代码和跑测试。**

具体要求：
1. **每个 task 使用 `Agent` 工具派遣**，参数必须包含：
   - `subagent_type`: 必须使用 scoped 专职 `enterprise-harness:tdd-executor`，不得回退到任何通用 worker
   - `isolation`: 使用 `"worktree"` 实现隔离（防止并发写冲突）
   - `prompt`: 包含完整的 task 描述、touched files、RED/GREEN evidence point
   - prompt 第一段必须包含 `handoff create ... tdd.execute-task execute` 返回的 `HANDOFF_INPUT`
2. **Subagent 必须通过 `enterprise-harness tdd-run ... -- <literal argv>` 执行真实构建命令**：
   - Java/Maven 项目：必须执行 `mvn test` / `mvn verify` / `mvn compile`
   - 不得跳过构建命令，不得只写代码不验证
   - RED 阶段：执行测试 → 必须失败 → 记录失败输出
   - GREEN 阶段：执行测试 → 必须通过 → 记录通过输出
   - REFACTOR 阶段：执行测试 → 必须全绿 → 记录通过输出
3. **主 orchestrator 只消费权威 receipt**：
   - worker 文本只用于导航，不是 completion evidence
   - receipt 必须绑定 agent_id、worktree、HEAD/tree digest、exact argv、exit code、时间与 RED→GREEN→REFACTOR 顺序
   - executor 返回后，以 executor runId 创建 role=check handoff，派 `enterprise-harness:implementation-reviewer`
   - 集成 implementation commit 与独立 checker pass 后运行 `enterprise-harness evidence-import <change-id> <task-id>`
   - 主上下文不堆积整段构建输出
4. **禁止在主对话中直接 Write/Edit 生产代码**：
   - TDD 阶段的所有代码修改必须由 subagent 在 worktree 中完成
   - 主 orchestrator / `/harness-tdd` 只负责派遣 executor、消费结果、推进子状态

**违反此约束 = 阻断**：如果模型试图在主对话中直接写代码或跳过 mvn 执行，pre-write hook 会拦截。

## 行为要求

- 先写失败测试，再执行 RED
- RED/GREEN/REFACTOR 证据必须绑定**目标项目真实构建/测试命令**
- Java / Maven 项目必须执行 `mvn test` / `mvn verify` / `mvn compile` 这类项目原生命令
- **禁止只写测试文件而不运行构建命令**——没有看到 mvn 输出就不算 RED/GREEN
- **禁止用 MockMvc 冒充真实 HTTP E2E**
- 必须使用 worker / subagent 执行这些真实构建命令；主上下文只保留结果摘要
- GREEN 仅做最小实现
- REFACTOR 后必须重新确认全绿
- 每个 task 的 subagent 返回结果必须包含 task-id、agent-id/type、worktree/git common dir、三个 receipt refs、implementation commit、changed paths 与 exit summary；runtime 重新校验这些字段，不能信任文本本身

## 退出条件

- 已达到 `REFACTOR_VERIFIED`
- 当前 task 的 durable imported receipt 与独立 review 可被 `verify` 阶段消费
- 未完成项或失败项已显式记录
