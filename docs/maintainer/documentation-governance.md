# 文档治理

Enterprise Harness 采用“契约先行、实现闭环”，而不是“代码完成后再补文档”。文档不是一种资产：不同文档承担不同权威，更新时机也不同。

## 变更顺序

用户可见行为发生变化时，按以下顺序推进：

```text
问题证据
→ 用户承诺与适用边界
→ 长期 Spec / ADR / 设计
→ 可失败的 acceptance test
→ implementation
→ README / 用户手册 / 维护投影
→ 独立一致性检查
→ release
```

这里的“文档先行”特指用户承诺、长期合同和验收条件先于 implementation。README、故障排查和生成型 CLI reference 是投影，可以在行为稳定后更新，但必须与实现处于同一个 change，并在发布前通过门禁。

## 真相层与更新责任

| 内容 | 唯一权威 | 投影位置 | 必须何时更新 |
|---|---|---|---|
| 产品定位、目标用户、不适用场景 | `README.md` | marketing 材料 | 定义 change 时 |
| 用户可观察流程与恢复方式 | `docs/user/` | README 摘要 | acceptance test 之前 |
| 长期阶段、证据和权限合同 | `harness/specs/` | maintainer docs | implementation 之前 |
| 历史设计取舍 | `docs/adr/` | 不复制 | 重大、难逆决策批准时 |
| 当前机械能力追踪 | `harness/capabilities.json` | docs consistency 报告 | 同一 change 内、实现前 |
| CLI 参数与命令 | runtime CLI source | 生成的 `docs/maintainer/cli-reference.md` | 实现后由生成器刷新 |
| 错误码与恢复动作 | runtime behavior | `docs/user/troubleshooting.md` | 新错误码进入实现的同一 change |
| 当前研发状态 | `docs/internal/` | 无 | 仅作为可过期维护快照 |

同一规则不能在多个位置各自演化。投影文档应链接权威来源并面向其读者解释，不复制完整 schema、命令输出或实现细节。

## Capability trace

`harness/capabilities.json` 是当前对外能力的机械索引，不是营销评分表。每项能力必须具备：

- `productClaim`：一个可由用户理解、可被反证的中文承诺；
- `specRefs`：定义长期合同的一个或多个现行 Spec；
- `implementationRefs`：实施该承诺的 runtime、Skill、Agent、Hook 或生成器；
- `testRefs`：至少一个行为验收；
- `userDocRefs`：README 或用户手册中的解释；
- `maintainerDocRefs`：维护者如何理解、诊断或验证它。

`docs:check` 检查 ID 唯一、字段非空、路径存在且位于正确真相层。缺少任一方向时，能力不能作为当前产品承诺发布。

## Change 文档影响判断

| 变更类型 | 最小文档动作 |
|---|---|
| 新增或改变用户可见能力 | 先更新用户承诺、Spec、capability trace 和 acceptance test |
| 改变 stage、gate、freshness 或 recovery | 先更新 workflow/evidence 类 Spec，再更新用户工作流和维护时序 |
| 新增错误码 | 同一 change 更新 troubleshooting，并提供行为测试 |
| 新增或修改 CLI | 更新 source help，由生成器刷新 CLI reference |
| 仅内部重构且行为不变 | capability trace 不变；测试证明行为等价，必要时只更新 maintainer docs |
| 修正文案且不改变承诺 | 不需要新 Spec；不得借文案修改扩大产品能力 |

无法确定是否影响用户承诺时，默认按“影响”处理，直到行为测试证明等价。

## 完成定义

文档闭环需要同时满足：

1. README 的定位、适用边界和限制与当前能力一致；
2. 用户手册描述可观察行为，不要求用户理解内部 schema；
3. Spec 元数据、实现引用和测试引用保持 fresh；
4. capability trace 的五个方向全部存在；
5. CLI reference 与 runtime source 同步；
6. `npm run docs:check` 和 `npm run prepublish-check` 通过；
7. 竞争或 ROI 主张仍遵守对应证据等级，不把设计目标写成已实现事实。

文档检查通过只证明结构与已声明契约一致；真实 Claude Code 行为仍需要安装态 `claude -p` E2E，二者不能互相替代。
