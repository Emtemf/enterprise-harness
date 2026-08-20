# Implement method

在执行冻结 task 前读取。Implement 的目标是产生最小、可证明、可撤销的行为增量，不是“把代码写完”。

## Workflow

1. 复述 task outcome、write scope、strategy 和 acceptance；不从聊天扩展范围。
2. 先运行 strategy 的 observation phase（RED/REPRODUCE/BASELINE/DRY_RUN 等）。
3. 只做使下一验证通过的最小产品改动；不要顺手重构无关区域。
4. 每次失败读取真实输出，修正根因并重跑同一 frozen phase；不改写 receipt。
5. 验证 changed paths 与 task scope，完成 self-check 后交给独立 reviewer。

## Decision lenses

- **Minimum sufficient change**：是否存在更小 diff 达成同一 acceptance。
- **Local consistency**：是否使用仓库已有 abstraction、错误模型与命名。
- **Behavior preservation**：非目标行为是否由 characterization/regression evidence 保护。
- **Failure handling**：边界、partial failure、concurrency 与 cleanup 是否符合 design。
- **Test value**：测试观察行为而不是实现细节，并能在缺少实现时真实失败。

## Failure modes

- 为通过测试弱化断言、硬编码 fixture 或吞掉错误。
- 遇到失败后换命令、跳 phase 或手写“已通过”证据。
- 将 unrelated cleanup、dependency upgrade 或架构改造混入 task。
- 依赖 worktree isolation 代替 write scope、review independence 或安全 sandbox。
- 实现比 design 多一个公共 API、表字段或永久 abstraction，却未返回决策。

## Sources

- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
- [Google Engineering Practices: What to look for in a code review](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
- [NIST Secure Software Development Framework](https://csrc.nist.gov/projects/ssdf)
