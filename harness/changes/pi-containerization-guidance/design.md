# Design

## Requirement Alignment

本 change 的目标是参考 pi 的 containerization / sandboxing 文档方式，为 Enterprise Harness 增加一份稳定的运行时隔离说明。

重点不是实现沙箱，而是让外部读者能够明确理解：

1. 默认运行模型是什么
2. 哪些内容应留在宿主机
3. 哪些内容可以进入容器/沙箱
4. local adapter、secrets、governed writes 在容器化场景中的边界

## Current-State Evidence

当前仓库已讲清：

- portable runtime
- local runtime adapter
- doctor / sync / verify

但还没有一份稳定 spec 专门解释：

- 容器化/沙箱化是不是默认要求
- host 与 sandbox 的边界
- local adapter 在容器内外如何分离

## Options Considered

### Option A：直接实现 sandbox runtime

### Option B：先补稳定指南，再视需要推进实现

## Selected Option and Rationale

选择 **Option B**。

理由：

- 当前 issue #16 的最佳价值在于先补齐清晰的 repo-facing guidance
- 直接实现 runtime isolation 会把大量工程与安全细节耦合进本轮 change
- 文档先行更符合当前仓库的成熟度阶段

## Rejected Options

拒绝“直接实现沙箱 runtime”作为第一步，因为当前仓库还没有把 installer / productization 全部收紧到那一步。

## Affected Layers

- `harness/specs/`
- `README.md`
- `CONTRIBUTING.md`
- runtime structure validation (`lib/checks.mjs`)

## Cross-layer Type and Mapper Matrix

不适用。

## Repository Port Design

不适用。

## API Contract

不适用。

## Data Design

不涉及业务数据结构；会新增一份稳定 spec，并把它纳入 required project surface。

## Error Handling

若后续缺失该 spec：

- `verify` 结构校验会失败
- 读者将缺少稳定的容器化/沙箱化入口说明

## Transaction Boundaries

不适用。

## Testing Strategy

至少验证：

1. 新 spec 已创建
2. README / CONTRIBUTING 能指向它
3. `verify` 仍通过

## Rollout and Rollback

- rollout：先新增指南和入口链接
- rollback：可回退 required path 约束，但保留 issue 记录

## Risks

- 若把容器化写成默认模型，会误导用户
- 若宿主机 / 沙箱边界写不清，会增加错误预期

## Open Questions

1. 后续是否要补 Dockerfile / compose 示例？
2. 是否需要单独的 runtime README 继续扩展这份指南？

## Design Self-Review

- scope 小且清晰
- 文档优先，风险低
- 易于验证

## Approval

当前设计已具备进入实现的最小条件。
