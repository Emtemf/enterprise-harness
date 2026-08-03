# Change

## 原始需求

handoff create 报 unknown governed behavior 时不列合法列表，用户无法自助恢复。

## 业务结果

错误消息包含 `legal behaviors:` 列表，用户可直接复制合法值。

## 非目标

- 不扩展到 stage/role/agent/skill mismatch 的同类错误
- 不升级到 formatDiagnostic 统一通道

## 归属服务 / 模块 / 业务域

runtime/lib/handoff.mjs

## 初步路由

L1

### Router 评分
| 维度 | 分数(0-5) | 说明 |
|------|----------|------|
| Scope complexity | 1 | 单文件单行修改 |
| Impact breadth | 1 | 仅影响错误消息文案 |
| Unknowns / ambiguity | 1 | 所有事实已确认 |
| API / data risk | 1 | 无 API 变更 |
| Test / rollback complexity | 1 | 单个 smoke 断言 |
| **Overall** | 1.0 | |

## 最小探索证据

codegraph_explore × 3，codegraph_search × 3，codegraph_status × 1。错误源头定位到 runtime/lib/handoff.mjs:74，registry 已在 line 72 加载，Object.keys 即可取合法列表。3 个 smoke 不依赖该文案，零回归。

## 最终路由

L1：只改 runtime/lib/handoff.mjs:74。

## 影响矩阵
| API | Data | Architecture | Rule |
|-----|------|-------------|------|
| no | no | no | no |

## 假设

- behavior-checks.json 的 behaviors 对象 key 即合法列表
- loadBehaviorRegistry 已在 createHandoffInput 作用域内

