# Validation

## Source Digest

- `CLAUDE.md`
- `.claude/rules/*.md`
- `.claude/agents/*.md`
- `.claude/skills/harness-intake/SKILL.md`
- `.mcp.json`
- `harness/config.yaml`
- `.codegraph/`
- `hooks/*.sh`
- `harness/bin/*.sh`
- `harness/templates/*`
- `harness/reviewers/catalog.json`
- `harness/specs/*.md`

## Artifact Digest

- active change: `harness/changes/phase0-claude-governance-skeleton/`
- validation date: 2026-07-13

## Commands Executed

### 1. 结构校验

```bash
bash /home/wula/IdeaProjects/sdd/hooks/validate-spec-structure.sh
```

Expected result: 通过

Observed result:

```text
Harness structure validation passed.
```

### 2. codegraph 初始化与状态检查

```bash
codegraph init
codegraph status
```

Observed result summary:

```text
Initialized in /home/wula/IdeaProjects/sdd
Indexed 19 files
145 nodes, 215 edges
Index is up to date
```

### 3. Context7 CLI 可用性检查

```bash
npx -y ctx7 docs /react/react "useEffect examples"
```

Observed result summary:

```text
成功返回 React useEffect 相关文档片段。
```

### 4. intake 命令链与写入门禁 smoke test

Executed commands summary:

```bash
bash harness/bin/create-change-scaffold.sh intake-smoke-demo harness-governance L1
bash harness/bin/create-exploration-artifact.sh intake-smoke-demo codegraph-impact
bash harness/bin/update-change-state.sh intake-smoke-demo DISCOVERED L1
bash harness/bin/set-active-change.sh intake-smoke-demo
```

Observed result summary:

```text
可以成功创建/确认最小 change 资产、创建 exploration 资产，并把 intake-smoke-demo 推进到 DISCOVERED。
```

Additional gate smoke test:

```text
当 active change 为 draft-gate-demo 且状态仍是 DRAFT 时，pre-write-gate 会阻止 reference-service 源码写入，并返回：
BLOCK: 当前 active change 仍处于 DRAFT。请至少推进到 DISCOVERED 后再修改 reference-service。
```

### 5. 骨架阶段 full verify

```bash
bash /home/wula/IdeaProjects/sdd/hooks/full-verify.sh
```

Observed result:

```text
[full-verify] 1/7 结构校验
Harness structure validation passed.
[full-verify] 2/7 OpenAPI 轻量校验
OpenAPI structure validation passed.
[full-verify] 3/7 Controller/OpenAPI 一致性轻量校验
Controller/OpenAPI consistency validation passed.
[full-verify] 4/7 状态文件校验
Artifact state validation passed.
[full-verify] 5/7 review verdict 校验
Review verdict validation passed.
[full-verify] 6/7 change evidence 校验
Change evidence validation passed.
[full-verify] 7/7 模板占位检查（骨架阶段）
Full verify（骨架阶段）通过。
```

## Unit Tests

本次变更未新增或修改 Java 业务实现，未运行 Maven 单元测试。

## Unit Coverage

不适用；本次仅涉及治理骨架与模板。

## Architecture Tests

尚未引入 ArchUnit；本次变更不涉及 Java 编译边界重构。

## Integration Tests

未执行；本次变更不涉及运行时业务路径。

## Backend API E2E

未执行；本次变更不涉及 API 行为变化。

## OpenAPI Contract

轻量 YAML 结构校验通过；Controller/OpenAPI marker 一致性校验通过。

## Google Java Style

本次未修改 Java 源码，不适用。

## Review Verdicts

- 内部 verification reviewer：指出旧 `harness/work/.../result.md` 证据已 stale，不能用于本次骨架完成声明。
- 处理结果：补建 active change 下的当前 validation artifact，并重新记录本次执行命令输出。

## Skipped Checks

- CI checks：未配置
- ArchUnit：未配置
- JaCoCo：未配置
- HTTP API E2E：未配置

## Failures and Retries

- `hooks/pre-write-gate.sh` 首次写入时误用了 `Write` 的不支持参数，已修正并成功落盘。
- 原 deep-research workflow 抓取网页失败，后续已改用 GitHub API 与仓库一手文件人工核实关键参考。
- `validate-change-evidence.sh` 首版过度强制所有 `harness/changes/` 都必须采用新三件套，导致 legacy MVP change 样例报错；现已改为兼容历史目录与 Phase 1 样式目录并重新验证通过。
- `pre-write-gate.sh` 首次 smoke test 出现 `UNEXPECTED_PASS`；原因是 heredoc 抢占了 stdin，导致管道 JSON 未传入 Python。现已改为先在 shell 读取 stdin，再通过环境变量传入 Python，并重新 smoke test 证明 DRAFT active change 会被正确阻断。

## Final Verdict

本次 Phase 0 骨架改造的最小完成声明，有新鲜仓库内验证证据支撑：

- 自动加载规则层已建立
- reviewer 骨架已落盘
- 根 `CLAUDE.md` 已重写为中文操作合同
- hook 骨架脚本已存在且可运行
- harness 模板与 reviewer catalog 已落盘
- 项目级 `.mcp.json` 骨架与 `harness/config.yaml` 工具能力声明已落盘
- `codegraph` 已完成项目初始化，可进行真实 codegraph-first 探索
- `Context7` 已声明项目级 MCP 接入骨架；虽然 MCP 仍缺审批与环境变量，但已证明可通过 `ctx7` CLI 路径查询文档，因此当前至少具备可用的 Context7 fallback 入口
- `harness-intake` 已从说明骨架升级为更接近真实入口的项目 skill
- `harness/specs/requirement-intake.md` 与 `harness/specs/tool-fallback-policy.md` 已落盘
- `harness/templates/exploration.md`、`harness/templates/tooling-evidence.md` 与 `hooks/validate-change-evidence.sh` 已落盘并通过当前阶段验证

这不代表企业级完整门禁已完成，只代表治理骨架已进入可继续迭代状态。
