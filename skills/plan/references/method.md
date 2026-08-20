# Plan method

在把 approved design 切成 tasks 前读取。Plan 优化的是可安全交付的 change sequence，不是文件清单。

## Workflow

1. 从用户可观察结果向下切 vertical slices，每个 slice 同时包含必要实现与相关测试。
2. 将纯重构/准备工作与行为变化分开；准备 task 必须有独立价值或解除明确 blocker。
3. 画出显式 DAG，优先放置高风险事实验证、compatibility seam 与 migration rehearsal。
4. 为每个 task 冻结 in/out scope、strategy、exact argv、acceptance、review input 和 recovery。
5. 逐项做 restart test：新的 implementer 只读 design/task 是否能无聊天上下文继续。

## Decision lenses

- **One outcome**：task 只交付一个可描述、可 review 的结果。
- **System stays valid**：每个 task 集成后 build、schema 与 consumer 不处于破损中间态。
- **Risk early**：未知 API、数据迁移、性能或安全假设先用 spike/characterization 消除。
- **Reviewability**：reviewer 不需要未来 task 才能理解当前变更。
- **Reversibility**：rollback 不依赖手工猜测或未记录外部状态。
- **Parallel safety**：并行 task 的 write scope 不重叠；重叠则显式依赖。

## Failure modes

- 按 controller/service/repository 横向分层，直到最后一个 task 才出现用户价值。
- task 名为“phase 1”“misc changes”或依赖文档顺序表达 DAG。
- 将重构、功能、生成文件和 migration 混成一个巨大 task。
- exact argv 存在，但不能证明 acceptance 或不适合该 strategy。
- task 小到没有独立语义，或大到 reviewer 无法一次建立心智模型。

## Sources

- [Google Engineering Practices: Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html)
- [Google Engineering Practices: Writing good CL descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html)
- [Anthropic Skill authoring: workflows and feedback loops](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
