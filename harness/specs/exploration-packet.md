# Exploration Packet Contract

## 目标

为 clarify-first staged workflow 提供统一的探索返回结构，让高噪声探索可以下沉给 read-only subagent，而主 orchestrator 只消费压缩结论。

## 适用场景

以下探索默认优先下沉为 read-only subagent：

- 多模块代码探索
- 调用链/影响面分析
- 外部库、框架、SDK、版本行为文档调研
- 在问用户前需要先拿到 repo 事实的 brownfield 需求澄清
- 预计会污染主上下文的高噪声搜索

以下探索可由主 orchestrator 直接完成：

- 单文件、单符号、低成本确认
- 已知路径的定向状态检查
- `ACTIVE_CHANGE` / `state.json` / `validation.status` 等轻量事实查询

## 基本原则

1. exploration subagent 必须只读，不修改业务源码
2. exploration 返回压缩结论，不返回原始 dump
3. exploration 结果必须可被 requirements/design/plan/verify 阶段消费
4. exploration 结果应优先指向下一步动作：
   - 问用户哪个问题
   - 更新哪个 artifact
   - 触发哪个 reviewer

## 标准字段

每次 exploration 至少应返回：

### 1. `question`
本次探索试图回答的具体问题。

### 2. `scope`
探索覆盖的范围：
- repo/module/path
- 文件集合
- 外部文档来源
- 查询策略

### 3. `facts`
已确认的事实列表。每条事实应尽量附：
- file path / symbol / codegraph query / doc source
- 简要结论

### 4. `uncertainties`
探索后仍未确认的点。

### 5. `impact`
这些事实/不确定性对哪一阶段有影响：
- clarify
- route
- design
- plan
- tdd
- verify

### 6. `suggestedUserQuestion`
如果还需要问用户，当前最值得问的**一个**问题。

### 7. `sources`
证据来源列表：
- codegraph query
- file path
- official doc URL
- Context7 query

## 推荐输出格式

### Markdown 版本

```md
# Exploration Packet

## Question

## Scope

## Facts
- source:
  finding:

## Uncertainties
- 

## Impact
- clarify:
- route:
- design:
- plan:
- tdd:
- verify:

## Suggested User Question

## Sources
- 
```

### 结构化对象版本

```json
{
  "question": "...",
  "scope": ["..."],
  "facts": [
    {
      "source": "file/codegraph/doc",
      "finding": "..."
    }
  ],
  "uncertainties": ["..."],
  "impact": {
    "clarify": "...",
    "route": "...",
    "design": "...",
    "plan": "...",
    "tdd": "...",
    "verify": "..."
  },
  "suggestedUserQuestion": "...",
  "sources": ["..."]
}
```

## 与 Context Packet 的关系

- Exploration Packet：一次探索的压缩结果
- Context Packet：clarify 完成后、供后续阶段长期复用的业务上下文压缩包

Exploration Packet 是 Context Packet 的来源之一，但不应直接等同于 Context Packet。

## 禁止事项

- 不得把原始 grep/codegraph/doc dump 直接塞给主 orchestrator
- 不得把 exploration 当成实现任务去改写业务源码
- 不得在没有证据引用的情况下把猜测写成 facts
- 不得一次返回多个互相竞争的“下一问题”而不排序
