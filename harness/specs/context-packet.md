# Context Packet Contract

## 目标

为 clarify-first staged workflow 提供可长期复用的业务上下文压缩包，让主 orchestrator 和下游 stage/worker 在 200k 级上下文限制下仍能共享高价值业务事实，而不需要反复重读全量对话。

## 适用阶段

`context packet` 在 clarify 完成后生成，供以下阶段与 worker 复用：

- route
- design
- plan
- tdd
- verify
- `code-explore` / `doc-research` / `impact-explore` 等 read-only worker

## 基本原则

1. context packet 只保留后续阶段高频复用的业务上下文
2. context packet 不替代 `requirements.md`，而是 requirements 的压缩提炼版
3. context packet 不应混入原始聊天 dump 或冗长探索原文
4. context packet 生成后，后续 stage/worker 应优先读取它，而不是重放整段对话

## 最小字段

至少应包含：

### 1. `businessGoal`
本次 change 试图实现的业务目标。

### 2. `scope`
本次执行范围与边界。

### 3. `nonGoals`
明确不做什么。

### 4. `constraints`
关键技术/流程/组织约束。

### 5. `acceptanceCriteria`
后续 plan/TDD/verify 必须消费的验收标准。

### 6. `domainGlossary`
关键领域词汇与缩写解释。

### 7. `openRisks`
虽不阻断后续阶段，但仍应被记住的风险或待跟踪项。

## 推荐输出格式

### Markdown 版本

```md
# Context Packet

## Business Goal

## Scope

## Non-goals

## Constraints

## Acceptance Criteria

## Domain Glossary
- term:
  meaning:

## Open Risks
- 
```

### 结构化对象版本

```json
{
  "businessGoal": "...",
  "scope": ["..."],
  "nonGoals": ["..."],
  "constraints": ["..."],
  "acceptanceCriteria": ["..."],
  "domainGlossary": [
    {
      "term": "...",
      "meaning": "..."
    }
  ],
  "openRisks": ["..."]
}
```

## 与 Requirements 的关系

- `requirements.md`：完整、durable、可评审的澄清结果
- `context packet`：供 orchestrator/worker 快速复用的压缩业务上下文

## 禁止事项

- 不得把 context packet 当作唯一 source of truth，替代 `requirements.md`
- 不得把未确认的猜测写成约束或 acceptance criteria
- 不得把完整 exploration dump、长对话 transcript 直接塞进 context packet
