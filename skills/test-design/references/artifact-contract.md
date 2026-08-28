# Test Design 制品合同

权威候选是当前 change 的 `test-cases.md`。只能使用 `assets/test-cases.md.tmpl` 的七个顶层章节，不能用聊天补足缺失内容。

## 稳定形状

顶层 `##` 章节全集必须恰好为以下七节，按顺序且各出现一次；任何第八节都 fail closed：

1. `输入与测试范围`
2. `Coverage Matrix`
3. `测试用例`
4. `E2E 用户旅程`
5. `测试数据、隔离与清理`
6. `风险优先级与最小充分集合`
7. `Test Design Self-Check`

`测试用例` 表头必须恰好为十列：

```markdown
| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |
```

- `TCID` 只接受唯一 `TC<number>`，从 `TC1` 开始；不能使用别名、零号、后缀或重复 ID。
- `Traces` 只接受以 `/` 分隔、真实存在的 `R<number> / D<number> / VO<number>`，每个 case 三类引用都必须存在。
- `D<number>` 只从 Architecture Design 的 `### Decisions` 精确表读取；声明必须恰好五列、字段完整且 `Status=accepted`，Alternatives 或 needs-decision 不能成为可引用决定。
- `Level` 只接受 `unit|integration|contract|migration|security|E2E`。
- `Priority` 只接受 `critical|high|normal`；`Status` 只接受 `accepted`。
- 十列都是语义字段；空值、`-`、TBD/TODO/待定/按需、模板标记和不可判定断言均 fail closed。
- `Actions` 只接受中文业务动作（例如“用户提交退款”），或单个明确的 HTTP method + path（例如 `POST /refunds`）。纯 ASCII runner/command、shell/bash/powershell/cmd fence、shell prompt、argv 形状，以及“执行/运行 + ASCII command + option/URL/path/test 参数”的命令语法都 block；单独出现技术名不构成命令。

## Coverage 与 journey

Coverage Matrix 的列固定为 `Source / Concern / Criticality / Applicability / Covered By / N/A Reason`。Source 只能是已声明的稳定 `R<number>` / `VO<number>`，或明确枚举的横切 dimension：`api|data|migration|compatibility|rollback|security|concurrency|consistency|observability`。`R0`、`R01`、`VO0`、`VOx`、未知 R/VO、任意 dimension 或重复 Source 均 block。每个上游 `R*` 和 `VO*` 必须恰好有一行 applicable coverage。`Covered By` 只能是以 `/` 分隔的纯 `TC<number>` 列表，且每个 ID 都必须真实声明；critical 行必须解析到 critical-priority case。`N/A` 行的 `Covered By` 必须为 `-`，并提供具体理由。

输入范围必须唯一声明 E2E 为 `applicable` 或 `N/A` 并解释原因。适用时至少有一个 `J<number>` journey；journey 必须 trace 已声明的 `R/D/VO` 和存在的 `TC`，并给出前置、步骤、可观察结果和 `accepted` 状态。

## 语义边界

Test Design 设计测试，不执行测试、不调用浏览器、不探测外部环境、不冻结 exact argv。candidate 任意位置出现 exact argv/argv/shell assignment、shell/bash/powershell/cmd fence、明确执行/运行测试，或使用具体 browser/driver/DevTools/MCP 执行或操作的 stage-boundary 声明都 block；TC `Actions` 与 journey `Steps` 还拒绝 shell prompt 和“执行/运行 + ASCII command + option/URL/path/test 参数”等命令语法。判断不扫描裸 runner/工具 token；`重启 Node 服务`、`Node 服务已启动` 与叙述中的技术名合法，测试数据章节的 JSON code fence 也是合法数据表达。

数据、清理和恢复必须足以暴露主要失败信号。observable assertion 采用正合同：数字或明确 literal 必须与响应、返回值、状态码、错误码、字段值、数量/计数等主体形成可判定关系；没有 scalar 时也可用唯一性/相同差异、创建/更新/删除/拒绝、存在性、可见性、日志/指标/事件等具体状态变化。“接口正常”“页面正确”“流程成功”“验证成功 1”“接口可用 \"ok\"”均不满足；“响应为200且成功”和“仅创建一条退款记录并返回相同退款标识”满足。

未决业务选择在 candidate 之外输出 `NEEDS_DECISION`，不能生成 `pass` candidate。candidate 任意语义位置出现 `NEEDS_DECISION`、未决、待补充、TBD/TODO 或模板标记都 block。self-check 的 passing 形状必须明确 `verdict: pass`、`unresolved decisions: none`、`placeholders: none`；self-check 不是 approval。

## 完成证据

`artifact-shape` 证明七个章节、表形、枚举、稳定 ID 和非占位字段；`coverage` 证明 requirements、VO、critical failure 和 applicable E2E 均有真实 case/journey；`traceability` 证明所有 `R/D/VO/TC` 引用闭合。三个 assertion 全部 `pass` 才可由 Task 4 finalizer 生成 StageResult，之后仍需 Main 发起独立 review。
