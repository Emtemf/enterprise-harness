---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - skills/
  - runtime/validators/skill-content-validator.mjs
  - .github/workflows/skill-quality.yml
testRefs:
  - runtime/test/skill-content-contract-smoke.mjs
  - runtime/test/skill-packaging-smoke.mjs
---

# Skill Authoring Contract

## 目标

Enterprise Harness 采用 **Skill-first, Hook-light**：Skill 提供 Claude 完成阶段任务所需的领域知识、
决策方法、条件工作流与反馈循环；Hook 只执行必须确定发生的安全检查、证据记录和机械 gate。
目录长得像 Skill 不是成功标准，fresh Claude 实例能在代表性任务中做出正确行为才是。

本合同对齐 Anthropic 的 Agent Skills 与 Claude Code Skill authoring guidance：metadata 负责发现，
`SKILL.md` 负责核心流程，supporting files 按需提供专门知识，scripts 执行确定性操作，evals 衡量行为。

## Skill 与 Hook 的责任边界

| 问题 | Owner |
|---|---|
| 如何理解上下文、比较方案、识别风险、形成设计或评审结论 | Skill / references |
| 如何按条件选择方法、何时返回 `NEEDS_DECISION` | Skill |
| 如何生成模板、运行冻结命令、校验 schema/invariant | assets / scripts / assert / runtime |
| 每次写入是否满足安全授权、证据是否存在且 fresh | Hook / runtime gate |
| 需求、设计、计划或代码质量是否“好” | Skill self-check + independent Review |

禁止把阶段 SOP、架构判断、风险推理、questionnaire 或 reviewer rubric 塞进 Hook。Hook 不补齐 Skill
没教会 Claude 的方法，也不根据聊天文本推断业务状态。

## Claude Code 原生内容合同

每个 shipped Skill 必须满足：

1. `description` 使用第三人称，先写 capability，再写 `Use when ...` 触发条件。
2. `SKILL.md` 少于 500 行，只保留 standing instructions、核心顺序、条件分支和 supporting-file 导航。
3. supporting files 从 `SKILL.md` 一级可达；超过 100 行的 reference 提供目录。
4. 每个 supporting file 说明何时读取。脚本默认“执行而非阅读”，除非明确声明用于算法参考。
5. 同一术语在生命周期中保持一致：stage、task、execution receipt、ReviewResult、CompletionProof。
6. 不重复 Claude 已知的通用知识，只写本 Harness 的方法选择、边界、失败模式和产物合同。

## 自由度预算

按错误代价而非个人偏好选择指令精度：

| 工作 | 自由度 | 约束方式 |
|---|---|---|
| Clarify / Design 方案探索 | 高 | lenses、证据边界、decision points |
| Plan 切片与 Review 判断 | 中 | 方法 + 必填合同 + 示例 |
| Implement strategy / Verify 命令 | 低 | frozen argv、runner、receipt |
| Archive / state transition | 极低 | runtime command、CAS、exclusive write |

高自由度不等于无标准；低自由度不等于把判断搬进 Hook。Skill 负责选择正确路径，runtime 负责证明
脆弱操作按已选路径执行。

## 阶段方法文件

除事实 lane 外，每个 lifecycle/review Skill 必须有一级 method reference：

| Skill | 必需方法资源 | 解决的问题 |
|---|---|---|
| `harness` | `references/stage-decisions.md` | 用户决策与阶段推进 |
| `design` | `references/method.md` + `references/decision-longevity.md` | 方案质量与长期后悔风险 |
| `plan` | `references/method.md` | vertical slice、依赖、风险排序 |
| `implement` | `references/method.md` | 最小变更、strategy feedback loop |
| `verify` | `references/method.md` | risk-based verification 与 claim/evidence |
| `archive` | `references/method.md` | 完成、abandon、provenance 与恢复 |
| `review` | `references/method.md` | 独立性、严重度与 code-health 标准 |

方法文件至少包含 workflow、decision lenses、failure modes、sources；内容应能改变 Claude 的行为，
而不只是解释目录格式。

## 三个月不后悔门槛

Design 不能保证未来永不变化，但必须让三个月后的维护者仍能理解、运行、替换和回滚。高影响决定
进入 Plan 前必须回答：

- 哪些 code/doc facts 与 assumptions 支撑它，哪些仍不确定；
- 至少一个可行替代方案为何未选，复杂度是否真的必要；
- API/data/security/operations/concurrency/cost 中哪些 forces 适用；
- 决定是 reversible、costly-to-reverse 还是 effectively irreversible；
- migration、rollback、observability、ownership 与 failure recovery 是否可执行；
- 什么信号会触发重新评估，如何 supersede 而不是改写历史决定。

缺少高代价不可逆决定、数据安全或兼容性选择时返回 `NEEDS_DECISION`；低风险可逆细节保留给 Plan/
Implement，避免过度设计。

## Evaluation-driven development

Evals 在扩写方法前先描述真实失败场景。每个 shipped Skill 至少四个 case，且至少一个 case 是
可执行场景，包含：

```json
{
  "id": "stable-id",
  "prompt": "代表性输入，而不是规则复述",
  "expectedBehavior": [
    "可观察行为 1",
    "可观察行为 2"
  ],
  "category": "behavioral"
}
```

`expectedBehavior` 是 fresh Claude 实例的行为 rubric；runtime smoke 继续验证机械 invariant。只检查
关键词或目录存在不能宣称 Skill 有效。

## 权威来源

- [Anthropic Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Anthropic Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/slash-commands)
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
