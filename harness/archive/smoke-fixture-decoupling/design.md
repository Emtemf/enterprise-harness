# Design

## Role Ownership
- 主导角色：Principal Architect 视角（L1，轻量设计）
- 参与角色：Fullstack Developer / Quality Engineer
- 本阶段交接物：`design.md`

## Current-State Evidence

见 `harness/changes/smoke-fixture-decoupling/evidence/`。**第一轮探索遗漏了 3 个文件，design-reviewer 第一轮
block 已纠正**（详见 `reviews/design-reviewer.json` 第一轮记录）。精确核实结果：

- `grep -rln "gate-tightening-skeleton" harness/plugin/runtime/test/*.mjs` 命中 4 个文件：
  1. `gate-hardening-design-gate-smoke.mjs`（`spawnSync` `cli.mjs verify --json`）
  2. `gate-hardening-task-state-smoke.mjs`（`spawnSync` `cli.mjs verify --json`）
  3. `gate-hardening-review-validation-smoke.mjs`（`spawnSync` `cli.mjs verify --json` **和** `stop.mjs`）
  4. `gate-hardening-validation-digest-smoke.mjs`（`spawnSync` `verify.mjs --json`，与 `cli.mjs verify` 同一底层脚本）
- 4 个文件都在 `createTempRepo()`（`copyDir(repoRoot, repoCopy)` 复制整仓，含全部真实 `harness/changes/*`）之后、
  任意 `createChange()` 调用之前，有完全相同结构的代码块：
  ```js
  const skeletonStatePath = path.join(repoCopy, 'harness', 'changes', 'gate-tightening-skeleton', 'state.json');
  if (fs.existsSync(skeletonStatePath)) {
    const skeletonState = readJson(skeletonStatePath);
    delete skeletonState.gates;
    writeJson(skeletonStatePath, skeletonState);
  }
  ```
- `gate-hardening-review-validation-smoke.mjs` 额外有一段同类"压制真实 change 噪音"逻辑（第 125-134 行
  `normalizedReviews` 数组），对另外 4 个真实 changeId（`intake-smoke-demo`/`phase0-claude-governance-skeleton`/
  `plugin-runtime-skeleton`/`reference-service-boundary-realignment`）用 `ensureReview()` 补写 `pass` verdict，
  本质与 skeleton 特殊处理是同一类手法（让真实 change 不在 `problems`/`stop.mjs` 输出里制造噪音）
- 各文件断言逻辑均只检查特定字符串是否出现在 `problems`/stdout/stderr 里，不检查数量/总量，与"清空后只留
  所需 fixture"的修法兼容
- 交叉核对 `gate-hardening-red-task-smoke.mjs`：只 `spawnSync` `pre-write.mjs` 针对单一文件路径，不调用
  `cli.mjs verify`/`verify.mjs` 做全量扫描，且不含 `gate-tightening-skeleton` 字符串，确认不受影响、无需改动

## Scope / Non-goals

范围内：上述 4 个测试文件的 fixture 隔离方式。

非目标：见 `change.md` 非目标章节（不改 4 个文件各自的 gate 语义断言、不改生产 runtime 代码、不处理
`validateOpenApiLight`/`validateControllerConsistency` 同类问题、不改动 `gate-hardening-red-task-smoke.mjs`）。

## Options Considered

### Option A：把现有的 `gate-tightening-skeleton` 特殊处理迁移到一个新建的专用测试 change 目录名
最小改动，但只是把耦合对象换了个名字，未来任何真实 change 进入不稳定状态时仍可能重演同样问题
（`gate-hardening-review-validation-smoke.mjs` 的 `normalizedReviews` 已经证明这个模式会自然演化出更多真实
changeId 依赖，不是孤立个案）。

### Option B：复制整仓后，清空临时副本 `harness/changes/` 下的全部真实条目，只注入各测试自己所需的 fixture
从结构上消除对任何真实 change 状态的依赖，一次性覆盖全部 4 个文件里出现的所有形式的"压制真实 change 噪音"手法
（包括 `normalizedReviews` 这种非 skeleton 特例）。

## Selected Option and Rationale

选择 **Option B**（clarify 已确认，范围扩大到 4 个文件后结论不变）。理由：
- 这 4 个测试的共同意图是"验证 `cli.mjs verify`/`stop.mjs` 能正确识别特定 gate 违规场景"，与仓库里其他真实
  业务 change 的具体内容无关
- Option A 只解决"点名了哪个真实 change"这一表层问题，`normalizedReviews` 证明真正的病灶是"整仓复制导致
  测试暴露在不可控的真实仓库状态下"，只有清空才能根治
- 清空后重新注入不影响各测试已有的断言逻辑，改动局限在 fixture 准备阶段

## Rejected Options

拒绝 Option A：第一轮 design 曾误以为只有 1 个文件受影响、后来发现是 4 个，进一步印证"点名压制"这种模式
本身就容易被遗漏和低估影响面，属于治标不治本。

## Affected Layers

- test layer：
  - `harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs`
  - `harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs`
- 不涉及 runtime/rules/specs 层

## Interface Contract
- External API: 不适用
- Internal service contract: 4 个测试文件均无对外导出接口，各自是独立可执行脚本（`red|green|verify` 三态），
  彼此之间及与其他文件均无 `import` 依赖关系
- Compatibility / caller impact: 无——没有其他脚本引用这 4 个文件

## Data / SQL Design
不适用。

## Messaging / Event / MQ Design
不适用。

## Architecture Boundary
不适用（纯测试基础设施改动，不涉及 Java 四层架构或 harness runtime 分层）。

## Flow / State Changes

对 4 个文件统一应用同一个改动模式：

1. 在 `createTempRepo()` 调用之后、第一个 `createChange()`/`ensureReview()` 调用之前，新增：
   ```js
   fs.rmSync(path.join(repoCopy, 'harness', 'changes'), { recursive: true, force: true });
   ```
2. 删除原有的"读取 `gate-tightening-skeleton` state.json、删除 `gates` 字段、写回"代码块（4 个文件均有）
3. 额外对 `gate-hardening-review-validation-smoke.mjs`：删除 `normalizedReviews` 数组及其 `for...of` 循环
   （第 125-134 行），因为清空后临时副本里不再有这 4 个真实 changeId，无需再补 reviewer verdict
4. 后续各文件的 `createChange()` 内部 `fs.mkdirSync(changeDir, { recursive: true })` 会隐式重新创建
   `harness/changes/` 目录，无需额外显式 `mkdirSync`

## Cross-layer Type and Mapper Matrix
不适用。

## Repository Port Design
不适用。

## API Contract
不适用。

## Error Handling
`fs.rmSync(..., { force: true })` 对目录不存在的情况天然安全（不抛异常），无需额外 try/catch。

## Transaction Boundaries
不适用。

## Testing Strategy
- Unit: 不适用
- Integration: 新增一个 guard smoke `harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs`。
  **关键设计约束（回应 design review 第二轮 block）**：这个 guard 自身的源码**不得**包含字面量字符串
  `'gate-tightening-skeleton'`（或任何具体真实 changeId），否则 `lifecycle.mjs:222-230` 的 `isReferencedByTests()`
  是对 `test/` 目录下全部 `.mjs` 文件做纯字符串子串扫描（`text.includes(changeId)`），guard 自己就会变成
  第 5 个"引用者"，让 `lifecycle archive gate-tightening-skeleton` 继续被拦截，直接违反本次验收标准。
  解法：guard **不写死任何具体 changeId**，改为运行时动态枚举：
  1. `fs.readdirSync(path.join(repoRoot, 'harness', 'changes'))` 读取当前真实存在的全部 changeId（这些名字
     只作为运行时字符串值出现，从不作为源码字面量写入 guard 自身）
  2. 对上述 4 个目标文件**及 guard 自身文件**逐一读取源码文本，断言其中不包含**任何一个**动态读到的真实
     changeId 作为子串（把 guard 自身也纳入扫描目标集合，将"guard 源码不得含真实 changeId 字面量"这一关键
     不变量从纯人工确认升级为自动化自我核验——采纳 design review 第三轮 pass 附带的改进建议）
  3. 这样 guard 自身文本里不会出现任何真实 changeId 字面量，不会触发 `isReferencedByTests`；同时这个检查
     天然比"只查 gate-tightening-skeleton 一个名字"更通用——能防止未来任何真实 change 被同样方式硬编码进这
     4 个文件（或 guard 自己），而不只是这一次修复的这一个 changeId
  - 范围限定：guard 只检查这 4 个目标文件，不扩大到全部 `test/*.mjs`（`gate-hardening-red-task-smoke.mjs`
    经 design review 第二轮核实还硬编码了另一个真实 changeId `gate-hardening-semantics`，属于同类问题但明确
    排除在本次范围外，记入 PROGRESS.md 技术债，不在此 guard 里连带检查，避免该 guard 一上线就对范围外文件报红）
- Backend API E2E: 不适用
- RED path:
  - Command: `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs red`
  - Expected failure: 在改动 4 个被测文件之前，guard 测试动态读到 `gate-tightening-skeleton`（当前仍是真实存在
    的 changeId）后，断言"4 个文件源码均不包含该动态读到的 changeId"失败（因为该字符串当前确实存在于全部
    4 个文件源码里）
- GREEN 之后的功能回归（不是新增 RED，是确认既有测试行为未被破坏，每个文件逐一验证）：
  - `node harness/plugin/runtime/test/gate-hardening-design-gate-smoke.mjs green`
  - `node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs green`
  - `node harness/plugin/runtime/test/gate-hardening-review-validation-smoke.mjs green`
    （**重点回归**：确认移除 `normalizedReviews` 后，`hasReviewerFailure`/`hasVerifyStaleFailure`/
    `hasStopReviewerBlock`/`hasStopReviewedStaleBlock`/`hasStopValidatedStaleBlock` 5 条断言仍全部通过）
  - `node harness/plugin/runtime/test/gate-hardening-validation-digest-smoke.mjs green`
  - `node harness/plugin/runtime/test/gate-hardening-fixture-guard-smoke.mjs green`（此时 `gate-tightening-skeleton`
    仍未归档，依然是动态枚举里的一员，验证 guard 本身在"真实 changeId 存在但 4 个目标文件已不再引用它"的
    状态下能正确转绿）
  - `node harness/plugin/runtime/cli.mjs lifecycle archive gate-tightening-skeleton` 必须成功
    （最终业务验收标准：`isReferencedByTests` 不再拦截；归档后 `gate-tightening-skeleton` 从
    `harness/changes/` 移到 `harness/archive/`，guard 的动态枚举列表里也不会再有它，不影响后续运行）

## Testing Strategy 补充说明
guard smoke 现在把自己的源码文件也纳入了扫描目标集合（见 Testing Strategy 第 2 步），"guard 自身不含真实
changeId 字面量"这一关键不变量由自动化断言保证，不再依赖实现期人工确认。

## Rollout and Rollback
- 4 个测试文件改动，随下次 `cli.mjs verify`/CI 运行即生效，无需发布/迁移
- 回滚：还原这 4 个测试文件到修改前版本即可，互相独立，可单独回滚任意一个

## Risks
- **`gate-hardening-review-validation-smoke.mjs` 风险最高**：移除 `normalizedReviews` 后，需要在 TDD 阶段
  用 GREEN 证据实测确认其 5 条断言仍能通过，不能假设——这是本次 4 个文件里唯一一个"移除的代码不只是
  skeleton 特殊处理本身"的文件，回归面更大
- 清空 `harness/changes/` 后，若某个测试隐含依赖了某个真实 change 提供的"背景 problems/reviews"来让断言更容易
  通过，会在该文件的 GREEN 阶段直接暴露（断言失败），届时需要为该测试补充等价的合成 fixture，而不是回退到
  依赖真实 change
- 这 4 个测试仍然 `copyDir` 整个仓库（不只是 `harness/changes/`），其余目录（`.claude/`、`harness/plugin/` 等）
  未受影响，不在本次改动范围内

## Open Questions
- 是否要把"清空 harness/changes/ 后只注入所需 fixture"的模式沉淀为可复用的测试 helper（比如统一到一个
  `test/lib/temp-repo.mjs`），供这 4 个文件及未来新增的同类测试直接复用？本轮 4 个文件已构成一定重复，
  值得在实现阶段视情况提取，但不强制——若提取会增加改动面，可留到下一轮

## Design Self-Review
- 覆盖 clarify 决策：✅（Option B 结构性修复，范围扩大后结论不变）
- 向后兼容：✅（不改变各测试断言逻辑，只改 fixture 准备方式）
- 范围克制：✅（明确排除 `gate-hardening-red-task-smoke.mjs`、明确排除 OpenAPI 同类硬编码问题）
- 范围准确性：✅（已用 grep 精确核实 4 个文件，不再依赖"交叉核对两个文件"这种未穷尽的人工判断）

## Approval
待 `design-reviewer` 消费（第二轮，范围已从 1 个文件修正为 4 个文件）。
