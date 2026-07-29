# Specs Index

本目录承载 Enterprise Harness 的**规范真相层**。

阅读原则：
- `CLAUDE.md` / `README.md` 负责短地图与导航
- 本目录负责当前可消费的规范真相
- 若某条规则同时出现在多个层，**以本目录中的 contract/spec 为准**

## 建议阅读顺序

### 1. 先理解当前产品方向
- `claude-code-only-phase1.md` — 为什么当前先收敛为 Claude Code-only
- `claude-code-only-phase1-blueprint.md` — 当前 phase 1 的可执行重构蓝图

### 2. 再理解结构边界
- `agent-skill-boundary.md` — skill / agent / hook 接缝层 / 业务原语层边界
- `handoff-scheme.md` — executor/checker 上下文隔离、TECPC envelope、hook 与诊断合同
- `upstream-mapping.md` — Superpowers / OpenSpec / deep-interview / Claude Code 官方建议映射

### 3. 再理解 staged workflow 主合同
- `staged-workflow.md` — clarify → route → design → plan → tdd → verify → archive 的总 contract
- `handoff-scheme.md` — 每个阶段如何隔离执行、独立检查并接力
- `session-lifecycle.md` — session-start / status / stop 等恢复相关 contract
- `plugin-runtime.md` — 当前 Claude Code 接缝层与动作层说明

### 4. 最后按阶段深读
#### clarify / intake
- `ambiguity-scoring.md`
- `context-packet.md`
- `exploration-packet.md`
- `brief-contract.md`
- `requirement-intake.md`

#### tdd / verify / double-check
- `tdd-execution.md`
- `verify-contract.md`
- `double-check-model.md`

## 分类约定

### 方向层
描述项目当前阶段、范围、产品形态：
- `claude-code-only-phase1.md`
- `claude-code-only-phase1-blueprint.md`

### 边界层
描述职责边界、来源映射、分层原则：
- `agent-skill-boundary.md`
- `upstream-mapping.md`
- `instruction-layering.md`

### 合同层
描述 staged workflow、阶段 contract、验证/消费规则：
- `staged-workflow.md`
- `tdd-execution.md`
- `verify-contract.md`
- `double-check-model.md`
- `ambiguity-scoring.md`

## 使用规则

- 新增长期规则时，优先放入本目录对应 contract，而不是先扩写 `CLAUDE.md`
- `CLAUDE.md` 只保留承重墙、硬约束摘要和导航
- `README.md` 只保留用户导向说明和深读入口
- 若某份 spec 只是来源复盘、不是当前真相，应明确写入边界，不得伪装成现行 contract
