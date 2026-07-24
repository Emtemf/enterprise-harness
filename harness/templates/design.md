# Design（闭环五检驱动）

> 每个设计决策必须回答四个问题：T 目标是什么、C 上下文有什么约束、E 用什么证据支撑、P 为什么选这条路径。

## Role Ownership
- 主导角色：Principal Architect 视角
- 参与角色：Fullstack Developer / Quality Engineer / Human User
- 本阶段交接物：提供给开发与测试消费的 `design.md`

## T 目标

### 业务目标
> 这次变更要达成什么？什么叫成功？

### 成功标准
> 怎么算做完了？验收条件是什么？

## C 上下文

### 当前状态（Evidence-based）
> 用代码探索和文档调研的事实支撑，不是凭空猜。
- 已探索的模块/文件/接口：
- 已确认的技术约束：
- 已知的依赖和风险：

### 影响矩阵
| 层 | 受影响文件 | 影响类型 |
|----|-----------|---------|
| Interface | | |
| Application | | |
| Domain | | |
| Infrastructure | | |

## E 证据

### 设计决策依据
> 每个关键决策都有证据支撑，不是"我觉得"。
| 决策 | 证据来源 | 置信度 |
|------|---------|--------|
| | | |

### 测试策略
- Unit：
- Integration：
- Backend API E2E：
- RED path：

### 验证命令
> 设计完成后用什么命令验证设计是对的？

## P 路径

### 方案选择
| 方案 | 优点 | 缺点 | 为什么选/不选 |
|------|------|------|-------------|
| A | | | |
| B | | | |

### 最终方案
> 选定方案的完整设计。

#### 接口设计
- External API：
- Internal service contract：
- Compatibility / caller impact：

#### 数据 / SQL 设计
- Schema / table changes：
- Migration：
- Rollback：
- Constraints / indexes / transactions：

#### 架构边界
- Layer ownership：
- Object / mapper responsibility：
- Error handling boundary：

#### 流程 / 状态变更

### 风险与回滚
- 风险：
- 回滚策略：

### P 纠正预案
> 如果实施中发现设计有偏差，怎么恢复？
- 降级方案：
- 回退条件：
- 监控指标：

## Design Self-Review
- [ ] T 目标明确且可验收
- [ ] C 上下文基于事实（非猜测）
- [ ] E 每个关键决策有证据
- [ ] P 路径清晰且有纠正预案

## Approval
