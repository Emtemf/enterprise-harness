# Design

## Role Ownership
- 主导角色：Principal Architect 视角（L1，轻量设计）
- 参与角色：Fullstack Developer / Quality Engineer
- 本阶段交接物：`design.md`

## Current-State Evidence

- `workflow-runner-smoke.mjs` 当前直接在真实仓库根目录 `repoRoot` 上执行：
  - `runWorkflow(repoRoot, ['run', changeId, ...])`
  - `runWorkflow(repoRoot, ['resume', changeId])`
  - `runWorkflow(repoRoot, ['status', changeId, '--json'])`
- 其中 `changeId = 'test-runner-smoke'`，`changeDir` / `eventLogPath` 都直接指向真实仓库的
  `harness/changes/test-runner-smoke/`
- `cleanup()` 虽会删除真实仓库里的该目录，但仍属于“先污染再清理”
- 与此同时，`workflow-decision-smoke.mjs` / `workflow-progression-decision-smoke.mjs` /
  `workflow-execution-status-smoke.mjs` 已经采用 `copyDir(repoRoot, repoCopy)` + `cwd=repoCopy` 的隔离模式，
  可以作为直接先例复用

## Scope / Non-goals

范围内：
- 仅修 `harness/plugin/runtime/test/workflow-runner-smoke.mjs` 的执行面与 cleanup 范围

非目标：
- 不修改 `workflow.mjs` 的 run/resume/status 业务语义
- 不顺手重构其他 workflow smoke
- 不抽象共享 helper（先做最小隔离修复）

## Options Considered

### Option A：继续在真实仓库运行，只是把 cleanup 做得更激进
无法消除测试中途失败/被中断时对真实仓库状态的污染，治标不治本。

### Option B：复制整仓到临时副本，在副本内运行全部 workflow 命令并读取副本内 event log
与现有其他 workflow smoke 的隔离模式一致，从根上消除对真实仓库 `ACTIVE_CHANGE` / `harness/changes/*` 的写入副作用。

## Selected Option and Rationale

选择 **Option B**。

理由：
- 仓库已经有成熟先例（多个 workflow smoke 都这样做）
- 业务目标不是测试 cleanup，而是测试 workflow runner 的机器可读输出与 event log 证据；这些都可以在副本里完成
- 改动局限在单文件，风险低

## Rejected Options

拒绝 Option A：无法防住“测试进程被中断时真实仓库残留脏状态”的核心风险。

## Affected Layers

- test layer：`harness/plugin/runtime/test/workflow-runner-smoke.mjs`
- 不涉及 runtime/rules/specs/Java 代码

## Interface Contract
- External API: 不适用
- Internal contract: 该测试文件仍保持 `red|green|verify` 三态脚本契约不变
- Compatibility / caller impact: 无其他文件 import 它

## Data / SQL Design
不适用。

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
不适用（纯测试隔离修复）。

## Flow / State Changes

新的测试流程：
1. `createTempRepo()`：
   - `mkdtempSync(os.tmpdir()/workflow-runner-...)`
   - `copyDir(repoRoot, repoCopy)`（跳过 `.git` / `.codegraph`，沿用既有模式）
   - **`repoRoot` 保持现有的 `fileURLToPath(new URL('../../../../', import.meta.url))` 动态计算方式**
     （回应 design review block：现有 9 个先例文件里 `repoRoot` 是硬编码绝对路径字面量
     `/home/wula/IdeaProjects/sdd`，这是那些文件自身的可移植性缺陷，不是本次要复用的部分——
     `workflow-runner-smoke.mjs` 当前已经用更好的动态计算方式，本次改动只复用"复制到临时副本 + cwd 切换"
     这个隔离**机制**，不连带复制那些文件里硬编码路径的写法）
2. 所有 `workflow.mjs run/resume/status` 都改在 `cwd=repoCopy` 上执行
3. `changeId` 保持 `test-runner-smoke` 不变，但它只存在于副本的 `harness/changes/test-runner-smoke/`
4. `eventLogPath` 改为指向副本里的 `harness/changes/test-runner-smoke/evidence/workflow-events.jsonl`
5. `cleanup()` 只删除 `tempRoot`，不再触碰真实仓库路径

### RED 证据采集的安全性（回应 design review block）

问题：要拿到"当前实现确实污染真实仓库"的 RED 证据，必须至少真实跑一次现有（有 bug 的）
`workflow-runner-smoke.mjs`；而它现有的 `cleanup()`（第 45-49 行）只删除 `harness/changes/test-runner-smoke/`，
**从不恢复被覆写的真实 `harness/ACTIVE_CHANGE`**——若不做防护，采集 RED 证据这个动作本身就会把真实仓库的
`harness/ACTIVE_CHANGE` 永久改写成 `test-runner-smoke`，这正是本 change 要消除的那类污染。

采集 RED 证据的安全流程（写入 tasks.md 时必须机械化为具体步骤，不允许"跑一下看看"）：
1. **采集前**：读出真实 `harness/ACTIVE_CHANGE` 当前内容并保存（记为 `originalActiveChange`）
2. 运行现有（未修复）`workflow-runner-smoke.mjs red`（或直接跑其内部逻辑），观察 RED 表现
   （断言"真实仓库不应存在 `harness/changes/test-runner-smoke/`"失败）
3. **采集后立即**：
   - 若真实 `harness/changes/test-runner-smoke/` 被创建，`rm -rf` 删除
   - 用 `originalActiveChange` 的内容覆写真实 `harness/ACTIVE_CHANGE`，恢复到采集前状态
4. 用 `git status`/`cat harness/ACTIVE_CHANGE` 二次确认真实仓库已恢复干净，再继续后续实现步骤

## Cross-layer Type and Mapper Matrix
不适用。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
- `copyDir()` 保持现有容错范围，不引入新的忽略规则
- `cleanup()` 用 `fs.rmSync(tempRoot, { recursive: true, force: true })`，即使测试中途失败也清理副本

## Transaction Boundaries
不适用。

## Testing Strategy
- 无需新增额外 smoke 文件；直接以 `workflow-runner-smoke.mjs` 自身完成 RED→GREEN
- RED path：
  - 先写一个更强的断言：测试结束后真实仓库根下**不应存在** `harness/changes/test-runner-smoke/`，
    且真实仓库 `harness/ACTIVE_CHANGE` 不应被测试写成 `test-runner-smoke`
  - 在当前实现下，这个断言会失败（因为当前就是在真实仓库 `repoRoot` 上运行 workflow，并直接写真实路径）
- GREEN path：
  - 改为副本运行后，`workflow-runner-smoke.mjs green` 通过
  - 并额外确认：
    - 真实仓库根下不存在 `harness/changes/test-runner-smoke/`
    - 真实仓库 `harness/ACTIVE_CHANGE` 的内容未被本测试改写为 `test-runner-smoke`
    - 副本内的 `workflow-events.jsonl` 仍包含 `"type":"resume"`

## Rollout and Rollback
- 单文件测试修复，随本地 smoke/verify 立即生效
- 回滚：还原 `workflow-runner-smoke.mjs` 即可

## Risks
- `workflow.mjs run` 可能隐式依赖 repo 根路径之外的外部环境；但既有其他 workflow smoke 已在副本模式下工作，
  说明总体风险低
- 如果 `workflow-runner-smoke.mjs` 还有未显式记录的“必须在真实仓库根运行”的假设，会在 GREEN 阶段直接暴露
- 整仓复制的性能开销：design review 已实测当前仓库规模下既有同类 `copyDir` 隔离 smoke（如
  `workflow-execution-status-smoke.mjs`）的复制耗时可接受，属于本仓库已验证过的既定模式，本次改动不引入
  新的性能量级
- RED 证据采集若不按上方"采集前快照、采集后恢复"流程执行，会把真实 `harness/ACTIVE_CHANGE` 污染成
  `test-runner-smoke`——这本身就是本 change 要修的问题，因此该流程必须机械化写入 tasks.md，不能靠人工记得

## Open Questions
- 是否未来把所有 workflow 相关 smoke 统一抽成共享的 `createTempRepo()` helper？本轮不抽象

## Design Self-Review
- 覆盖用户确认的范围：✅（只修 `workflow-runner-smoke.mjs`）
- 复用既有模式：✅（copyDir + temp repo）
- 不扩大范围：✅

## Approval
待 `design-reviewer` 消费。
