---
status: current
owner: enterprise-harness-maintainers
lastVerified: 2026-08-21
implementationRefs:
  - skills/
  - agents/
  - runtime/api/
  - runtime/validators/skill-packaging-validator.mjs
  - .claude-plugin/plugin.json
testRefs:
  - runtime/test/skill-packaging-smoke.mjs
  - runtime/test/plan-skill-script-smoke.mjs
  - runtime/test/runtime-public-api-contract-smoke.mjs
---

# Skill Packaging Contract

## 范围

本 spec 定义 Enterprise Harness plugin 内所有 Skill 的目录结构、资源语义、路径约定和分层契约。
任何新增 Skill、新增目录或新增 supporting file 必须符合本合同。

## 目录结构

每个 Skill 的标准目录形态：

```text
skills/<skill-name>/
├── SKILL.md                  # 必须
├── references/               # 可选：给 Claude 按需阅读的知识
├── assets/                   # 可选：输出模板与静态资源
├── scripts/                  # 可选：确定性准备/生成/收尾
├── assert/                   # 可选：确定性 invariant 验证
└── evals/                    # 可选：研发期行为回归测试
```

SKILL.md 是唯一必须文件。其他目录按需存在——不为形式创建空目录。

## 目录语义

| 目录 | 消费者 | 职责 | 禁止 |
|---|---|---|---|
| `SKILL.md` | Claude | 必须执行的核心流程 + supporting file 导航 | 塞全部细节；替代 references 的知识职责 |
| `references/` | Claude | 方法论、rubric、合同解释、示例 | 放必须机械保证的 invariant |
| `assets/` | Claude / scripts | 模板、boilerplate、输出素材 | 放运行规则或验证逻辑 |
| `scripts/` | Node.js runtime | prepare / transform / finalize | 做 subjective review；修改候选产物 |
| `assert/` | Node.js runtime | 纯验证：读 → validate → 返回 pass/block + evidence | 生成、修复、网络调研、用户决策或状态推进 |
| `evals/` | CI / 开发者 | 验证 Skill 行为是否符合意图 | 进入生产 lifecycle |

核心原则：

```text
SKILL.md tells Claude what must happen.
references/ tells Claude how to reason about it.
assets/ defines reusable output material.
scripts/ performs deterministic work.
assert/ proves deterministic invariants.
evals/ proves the Skill actually behaves as intended.
Runtime decides whether evidence is sufficient to advance.
```

## 分层契约

五个层次各司其职，不可混淆：

```text
Template (assets/)
    ↓
降低生成方差

Schema (harness/schemas/)
    ↓
结构合法

Assert (assert/)
    ↓
语义 invariant 成立

Independent Review (enterprise-harness:reviewer)
    ↓
判断方案质量

Runtime Gate (runtime/)
    ↓
决定能不能 transition
```

`Template ≠ Schema ≠ Assert ≠ Review ≠ Runtime Gate`。

## 路径约定

### Skill-local 资源

```text
${CLAUDE_SKILL_DIR}
```

指向包含当前 SKILL.md 的目录。用于 Skill 内的 scripts、assert、references、assets。

```bash
node "${CLAUDE_SKILL_DIR}/scripts/finalize-result.mjs" <change-id> <run-id>
```

### Plugin-global 资源

```text
${CLAUDE_PLUGIN_ROOT}
```

指向 plugin 根目录。用于跨 Skill 共享的 runtime、config、agents。

```bash
node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" ...
```

### Subject 项目

```text
${CLAUDE_PROJECT_DIR}
```

指向被治理的目标代码仓库根目录。

### 禁止

```text
${CLAUDE_SKILL_DIR}/../../runtime/...
```

Skill 不得通过相对路径穿越到 runtime 内部模块。跨 Skill/Runtime 边界只允许通过
`runtime/api/` 公共接口或 `${CLAUDE_PLUGIN_ROOT}` 路径。

### Runtime 公共 API 边界

Skill 的 `.mjs` 消费者只允许 import `runtime/api/`：

| Facade | 稳定职责 |
|---|---|
| `runtime/api/handoff.mjs` | handoff 读取、result path 与 classification 读取 |
| `runtime/api/result.mjs` | artifact digest、Stage/Review result 校验与 rubric 选择 |
| `runtime/api/task.mjs` | task receipt、ID/path safety 与 common-dir 查询 |

`runtime/core/` 与 `runtime/lib/` 是 plugin 内部实现，不是 Skill 可依赖的兼容面。validator 必须递归检查
Skill 中全部 `.mjs` 的静态和动态 import；直接引用内部模块时 CI fail。命令行调用仍使用
`${CLAUDE_PLUGIN_ROOT}/runtime/<entrypoint>.mjs`，它是进程边界，不等同于模块 import。

`runtime/api/` 的导出名称和可调用形状由 `runtime-public-api-contract-smoke.mjs` 冻结。内部文件可以重组，
但 Skill 消费者不跟随内部路径变化；公共导出发生 breaking change 时必须显式迁移消费者与合同测试。

## Supporting file 导航

SKILL.md **必须**通过 markdown 链接引用其 supporting files，并说明**何时读取**。
文件存在不意味着 Claude 会自动读取——Claude Code 使用 progressive disclosure 模型：

```text
Skill 被触发 → 读 SKILL.md
    ↓
SKILL.md 指示需要某资源 → 再读 references/... / assets/...
    ↓
SKILL.md 指示执行某脚本 → 执行 scripts/...
```

支持文件格式（以 design 为例，实际以各 Skill 的 SKILL.md 为准）：

```markdown
## Supporting files

- `references/method.md` — 形成设计时参考
- `references/artifact-contract.md` — 约束产物形状
- `assert/artifact-shape.mjs` — 验证 artifact 必要元素存在
```

SKILL.md 中的引用可用 markdown 链接或反引号路径；validator 两种都认可，但目标文件必须真实存在。
每个 supporting file 都必须被逐文件引用；只引用目录中的一个文件不能让同目录的其他文件逃过 orphan 检查。

## 资源分类规则

遇到一条规则或资源，先问：

| 问题 | 放入 |
|---|---|
| 必须每次执行？ | `SKILL.md` |
| Claude 做事的方法和知识？ | `references/` |
| 输出骨架/模板？ | `assets/` |
| 确定性操作？ | `scripts/` |
| 确定性判断？ | `assert/` |

## Artifact 模板归属

```text
Stage artifact template → skills/<skill>/assets/
    例：design.md.tmpl, tasks.md.tmpl, requirements.md.tmpl

Runtime bootstrap template → harness/templates/
    例：project-profile, command-policy, installer config

Machine contract → harness/schemas/
    例：stage-result.schema.json, handoff-v2.schema.json
```

三者不可互相混入。

## Assert 职责边界

assert/ 中的脚本是**纯谓词**：

```text
读取候选产物
    ↓
验证 invariant
    ↓
返回 { id, verdict: 'pass'|'block', evidence: string[] }
```

禁止：

- 修改候选产物（self-check 不能变成 self-healing）
- 发起网络请求
- 推进状态机
- 做主观质量判断（那是 Review 的职责）

## Anti-regrowth 规则

1. 新增目录必须在本 spec 的目录结构表中注册，才被视为合法。
2. 新增 assert/、assets/、scripts/ 以外的目录必须经过 design review。
3. 禁止在 Skill 内创建 `templates/`、`docs/`、`examples/`、`notes/` 等非标准目录。
4. 模板统一使用 `assets/`，不另建 `templates/`。

## Shipped Skill eval contract

目录结构层面 `evals/` 仍是按需目录；但 Enterprise Harness manifest 中发布的每一个 Skill 都必须提供
`evals/evals.json`。每个文件绑定当前 package version，至少含四个唯一 case，并为每个 case 声明
`id`、`description`、`expected` 和 `behavioral|runtime-gate` category。eval 不是生产 gate 的替代物：
它描述行为回归意图，runtime smoke 负责证明机械 invariant。

Validator 同时检查 Skill/Agent YAML frontmatter 不含重复顶层 key，避免 YAML parser 对重复字段采用
不一致的 first/last-wins 行为。

## Plugin manifest 语义

### Skills

`plugin.json` 的 `skills` 字段默认是 adds to default scan。
`skills/` 目录本来就会自动扫描。显式列表仅作为 CI inventory check 的参考，
不作为 "只允许这些 Skill" 的可靠 allowlist。

CI validator 应独立维护 expected skill set，不依赖 manifest 语义。

### Agents

`plugin.json` 的 `agents` 字段会 **replace default scan**。
保留显式列表作为 allowlist，CI 检查 agents/ 实际文件 == manifest 列表 == expected set。

## 相关 spec

- [architecture.md](architecture.md) — 整体分层与安装面
- [evidence.md](evidence.md) — 证据合同与 TECPC
- [agents-and-handoff.md](agents-and-handoff.md) — Agent 身份与 handoff 协议
- [hooks.md](hooks.md) — Hook gate 与事件适配
