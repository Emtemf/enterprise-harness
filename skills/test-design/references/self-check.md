# Test Design 自检

提交 candidate 前逐项检查：

1. marker prepare 的 change/run identity、`inputRefs` 与 `inputDigests` 仍新鲜；只读取了 frozen requirements 和 Architecture Design 输入。
2. 每个 `R*` 与 `VO*` 恰好有一行 applicable coverage 并解析到纯 `TC*` 列表中的全部真实 ID；非上游 Source 只使用 `api|data|migration|compatibility|rollback|security|concurrency|consistency|observability`，没有非法 namespace、任意 dimension、未知 R/VO 或重复 Source。每个 TC 同时引用已声明的 `R* / D* / VO*`。
3. 每个 critical failure 都由 critical-priority TC 覆盖；成功、失败、边界与恢复信号可从 observable assertion 判定。
4. 每个 TC 恰好十列，至少存在 `TC1`，ID、level、priority、status 均使用允许值；没有空字段、不可判定断言或模板占位符；数字/literal 与响应、返回、状态码或字段值等主体有明确关系，数量/计数还绑定具体领域对象与关系，或者断言给出唯一性、相同差异、变更/拒绝、存在性、可见性或日志/指标/事件等具体状态变化；裸“数量1”、“验证成功，数量 1”和“仅验证成功”没有伪装成证据。
5. E2E 适用时存在至少一个闭合 `J* → R*/D*/VO*/TC*` journey；不适用时 `N/A` 有事实理由。
6. 数据唯一性、并行隔离、清理失败、故障恢复和残留检查明确；最小充分集合的删除代价可说明。
7. 顶层 `##` heading 全集恰好为模板七节；candidate 任意位置都没有 exact argv/argv assignment、shell-language fence、明确测试执行，或同一语义片段内“具体 browser/driver/tool + 主动使用动词 + 测试/浏览器/页面语义”的执行组合；`command`/`shell` assignment 仅在值呈 runner、`./`、option、URL 或 shell operator 等 command shape 时阻断，普通 YAML data 不误拦。TC Actions 是中文业务动作或明确 HTTP method+path，Actions 与 E2E Steps 也没有 shell prompt 或“执行/运行”后紧跟 ASCII command token。`执行退款`、`重启 Node 服务`、前置及叙述中的技术名和数据章节的 JSON/YAML fence 没有被误当成执行指令。
8. 缺少真实业务选择时在 candidate 之外返回一个 `NEEDS_DECISION` 并停止；candidate 任意位置的 NEEDS_DECISION、未决、待补充、stale input 或 placeholder 不得伪装为 pass。被引用的 Design Decision 必须字段完整且 `Status=accepted`。
9. `artifact-shape`、`coverage`、`traceability` 全部通过；self-check 只写 pass/block，不写 approved。
10. Task 4 finalizer 可用后才持久化 StageResult；随后由 Main 创建不同 run 的独立 review。
