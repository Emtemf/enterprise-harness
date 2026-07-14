---
name: harness
description: >
  Enterprise Harness 的统一流程入口。用于接住新需求、继续当前 change、决定应该走 intake / validation / release 路径，或明确应该调用哪个 runtime command。适用于“我应该从哪开始”“帮我按 harness 流程推进”“继续当前 change”“需要一个确定性的 change 入口命令”等场景。
---

# Harness Entry

## 目标

给当前仓库提供一个**显式的前门**，而不是只依赖自动加载规则和 hooks。

本入口的职责不是替代 hooks，也不是替代 runtime command，而是把三层模型讲清楚并真正用起来：

1. **Skill**：负责流程编排
2. **Command**：负责本机/runtime/仓库确定性动作
3. **Hooks**：负责自动提醒、阻断、校验

## 入口模型

### 1. 在 Claude Code 会话中
优先使用：

- `/harness`

它是统一工作流入口，用于：

- 接住新需求
- 继续当前 change
- 判断下一步是 intake / design / plan / validation / release
- 明确应该调用哪个 runtime command

### 2. 在本机/runtime 动作中
优先使用：

- `node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]`
- `node harness/plugin/runtime/cli.mjs bootstrap`
- `node harness/plugin/runtime/cli.mjs doctor`
- `node harness/plugin/runtime/cli.mjs sync`
- `node harness/plugin/runtime/cli.mjs verify`

### 3. 自动发生的事情
无需显式调用，但会自动生效：

- `CLAUDE.md`
- `.claude/rules/`
- `.claude/settings.json` hooks

这些负责：

- 默认流程约束
- 写前/写后 gate
- stop validation 检查

## 你被调用后应该怎么做

### 模式 A：用户带来一个新需求 / 修改需求
按 `harness-intake` 的规则推进：

1. 判断 request shape
2. 做 provisional triage
3. 做 minimum discovery
4. codegraph-first
5. 外部库问题 Context7-first
6. 形成 final route（L0/L1/L2/L3）
7. 明确下一个 artifact / gate

若需要最小 change 资产但当前还没有，可优先驱动或建议：

```bash
node harness/plugin/runtime/cli.mjs start-change <change-id> [owner] [tier] [topic]
```

### 模式 B：用户想继续当前 change
优先检查：

- `harness/ACTIVE_CHANGE`
- 对应 `state.json`
- 当前 blockers / decisions / validation 状态

然后回答：

- 当前做到哪一阶段
- 下一步应该进哪个 gate
- 是否需要 design / RED / validation 证据

### 模式 C：用户问“我该跑哪个命令”
不要泛泛而谈，直接按目标给出命令：

- 新机器接入：`bootstrap` → `setup-local-adapter --write` → `doctor` → `sync`
- 新 change 入口：`start-change`
- 本地 contract 检查：`verify`
- 上游盘点：`upstream-check`

### 模式 D：用户想发版 / 做发布动作
优先区分：

- 是仓库文档和 release 文案整理
- 还是 runtime / package / tag / GitHub Release 动作

若是后者，应明确：

- 当前版本
- 是否需要 bump
- 是否需要 tag / PR / merge / release
- 是否已有对应 release note

## 与 `harness-intake` 的关系

- `/harness` 是**总入口**
- `harness-intake` 是**intake 专用入口**

当问题本质上是“开始一个需求工作流”时，你可以直接按 `harness-intake` 的顺序执行，不必把用户来回踢给别的入口。

## 禁止事项

- 不得把 hooks 当成总编排器
- 不得把 command 当成需求分析器
- 不得在未完成 intake / route 前直接进入实现
- 不得在 codegraph 可用时跳过 codegraph-first
- 不得把“skill 可能被模型选中”误表述成“像 hook 一样自动触发”
