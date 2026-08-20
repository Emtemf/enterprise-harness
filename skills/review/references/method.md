# Review method

每次 Review 开始时先读取，再按 selector 加载 stage/domain rubrics。Review 的标准是改动是否明确提升
当前系统的整体健康度，并足以支持下一阶段；不是追求个人偏好或抽象完美。

## Workflow

1. 验证 reviewer 独立性、输入 digest 与 rubricIds；不读 executor transcript。
2. 先看整体 design/behavior，再看 correctness、complexity、tests、security、operations 与文档。
3. 每个 finding 绑定 artifact/receipt evidence，区分 `block` 与非阻断建议。
4. block 必须说明影响、证据和最小可执行 correction；不替 executor 修改候选产物。
5. 只有所有 blocking finding 已解决且 fresh 时返回 pass。

## Decision lenses

- **System health**：是否改善 maintainability、readability、consistency 与 operability。
- **User/developer behavior**：是否实现声明目标，是否伤害 consumer 或未来维护者。
- **Complexity budget**：新增复杂度是否有当前价值与验证支撑。
- **Evidence over preference**：技术事实、项目 convention 与明确设计优先于个人风格。
- **Proportionality**：不因非关键 polish 阻塞整体改善，也不因 change 小而忽略累积退化。

## Failure modes

- 从格式和命名开始，没先判断方案是否属于这个系统。
- 只找 bug，不检查长期复杂度、文档、测试、rollback 与运维影响。
- finding 没有证据或 correction，只写“考虑优化”。
- reviewer 读取 executor 解释后替其补全缺失证据。
- 追求完美而阻塞明确改善，或为了速度接受确定降低 code health 的变更。

## Sources

- [Google Engineering Practices: The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html)
- [Google Engineering Practices: What to look for](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
