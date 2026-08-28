# Independent Test Design Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将详细测试用例从 Architecture Design 中拆出为独立、摘要绑定、可独立评审的 `test-design` Skill，并让复合 DesignProof、Plan、Verify 与 Archive 全程追踪 `test-cases.md`。

**Architecture:** 保持 `clarify → design → plan → implement → verify → archive` 六阶段不变。Design 阶段内部先生成并评审 `design.md`，runtime 发布 `design-architecture.json`，再由隔离的 test-design worker 生成并评审 `test-cases.md`；最终 `design.json` 以两条 execute/review chain 聚合完成证据。

**Tech Stack:** Claude Code plugin Skills/agents、Node.js ESM、Handoff v2、StageResult/ReviewResult/CompletionProof、Markdown deterministic assertions、现有 smoke-test runner。

**Spec:** `docs/superpowers/specs/2026-08-28-test-design-skill-design.md`

## Global Constraints

- 目标版本固定为 `0.5.12`。
- 用户可见 lifecycle 仍严格为 `clarify → design → plan → implement → verify → archive`。
- `test-design` 是 Design 内部 capability，不是 lifecycle stage。
- 所有 Skill 文案和用户文档使用中文；稳定 ID、schema field 和错误码保留英文。
- Skills 只通过 `runtime/api/*` 导入运行时能力，不直接导入 `runtime/core/*` 或 `runtime/lib/*`。
- `test-design` 不执行测试、不操作浏览器、不修改产品代码、不写 state、不向用户提问。
- `test-cases.md` 是详细测试用例唯一权威来源；`design.md` 只保留 `VO*` 可验证性义务。
- 不保留 0.5.11 双权威兼容路径。
- 每项行为变更必须先运行能够因缺失行为而失败的 RED 测试，再实施最小 GREEN。
- runtime、installer 或 release surface 改动后必须运行 `npm run prepublish-check`；最终发布前运行 `npm run quality:local`。

---

## File map

### New test-design unit

- `skills/test-design/SKILL.md`: 自动调用入口与隔离执行合同。
- `skills/test-design/assets/test-cases.md.tmpl`: 唯一测试用例制品骨架。
- `skills/test-design/references/{method,artifact-contract,self-check,examples}.md`: 方法、输出语义、自检与 few-shots。
- `skills/test-design/assert/{artifact-shape,coverage,traceability}.mjs`: 结构、覆盖和引用完整性门禁。
- `skills/test-design/scripts/{prepare-input,finalize-result}.mjs`: handoff 冻结输入与 immutable StageResult。
- `skills/test-design/evals/evals.json`: should-trigger、拒绝越权和 adversarial execution 场景。
- `agents/test-design-worker.md`: 只能产出测试设计制品的 capability agent。
- `skills/review/references/test-design.md`: 独立测试设计 review rubric。

### Runtime and proof unit

- `runtime/core/design-proof.mjs`: ArchitectureProof 与复合 DesignProof 的构造。
- `runtime/design.mjs`: `seal-architecture` CLI，发布 test-design 可消费的 architecture proof。
- `runtime/api/design.mjs`: Skill 可用的 architecture proof 读取/校验 API。
- `runtime/core/handoff-agent.mjs`: `design.test-cases` → test-design-worker 路由。
- `runtime/lib/{agent-evidence,result-contract,review-rubrics,stage-contract,stage-results,artifacts,execution-prerequisites}.mjs`: capability、schema、复合 gate 和依赖传播。

### Orchestration and downstream unit

- `skills/harness/references/behavior-map.md`: Main 的 Design 内部精确时序与 argv。
- `skills/design/**`: 从详细 TC 收窄为 Architecture Design + VO。
- `skills/plan/**`, `skills/verify/**`, `skills/archive/**`: test-cases 输入绑定与消费合同。
- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `harness/plugin/manifest.json`: plugin/version projections。
- `harness/policy.json`, `harness/specs/**`, `docs/user/**`, `docs/maintainer/**`: 真相层和说明层。

---

### Task 1: Freeze plugin surface and capability routing

**Files:**
- Modify: `runtime/test/v05-capability-surface-smoke.mjs`
- Modify: `runtime/test/plugin-entry-agent-contract-smoke.mjs`
- Modify: `runtime/test/plugin-agent-surface-smoke.mjs`
- Modify: `runtime/test/reference-wiring-contract-smoke.mjs`
- Modify: `runtime/test/skill-first-wiring-smoke.mjs`
- Modify: `runtime/test/handoff-agent-routing-smoke.mjs`
- Create: `runtime/test/test-design-skill-wiring-smoke.mjs`
- Create: `agents/test-design-worker.md`
- Create: `skills/test-design/SKILL.md`
- Modify: `.claude-plugin/plugin.json`
- Modify: `runtime/lib/agent-evidence.mjs`
- Modify: `runtime/core/handoff-agent.mjs`

**Interfaces:**
- Consumes: `agentForV2Handoff(stage, behavior, role)` and `V6_CAPABILITY_AGENT_TYPES`.
- Produces: capability `enterprise-harness:test-design-worker`, Skill `test-design`, behavior route `design.test-cases`.

- [ ] **Step 1: Extend surface tests before adding files**

Update expected arrays to include `test-design` and `test-design-worker`, and add this routing assertion:

```js
assert.deepEqual(
  agentForV2Handoff('design', 'design.test-cases', 'execute'),
  { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
);
```

The new wiring smoke must assert:

```js
assert.match(skill, /^user-invocable: false$/mu);
assert.match(skill, /^context: fork$/mu);
assert.match(skill, /^agent: enterprise-harness:test-design-worker$/mu);
assert.match(skill, /^argument-hint: HANDOFF_INPUT=<canonical-input\.json-path>$/mu);
assert.doesNotMatch(skill, /^background:/mu);
```

- [ ] **Step 2: Run RED surface tests**

Run:

```bash
node runtime/test/v05-capability-surface-smoke.mjs
node runtime/test/plugin-entry-agent-contract-smoke.mjs red
node runtime/test/plugin-agent-surface-smoke.mjs red
node runtime/test/handoff-agent-routing-smoke.mjs
node runtime/test/test-design-skill-wiring-smoke.mjs red
```

Expected: FAIL because the new Skill, agent and routing do not exist.

- [ ] **Step 3: Add the minimal capability and Skill shell**

Create `agents/test-design-worker.md` with exact frontmatter and boundary:

```markdown
---
name: test-design-worker
description: 从摘要绑定的需求与架构制品生成持久测试用例设计，不执行测试。
tools:
  - Read
  - Write
  - Edit
  - Bash
model: sonnet
---

# Test Design Worker

只消费 Handoff v2 冻结输入，只写当前 change 的 test-cases.md。不得修改产品代码、state、design.md 或其他阶段制品；不得执行测试、操作浏览器或替用户做业务决策。Bash 仅运行当前 Skill 的确定性脚本和 runtime CLI。
```

Create the Skill shell with the four official fields asserted above and `$ARGUMENTS` rendered inside a `text` fence. Add `test-design-worker` to `V6_CAPABILITY_AGENT_TYPES`, add the plugin Skill/agent entries, and route only exact behavior `design.test-cases` before the artifact-worker fallback:

```js
if (stage === 'design' && behavior === 'design.test-cases') {
  return { type: 'enterprise-harness:test-design-worker', skill: 'test-design' };
}
```

- [ ] **Step 4: Run GREEN surface tests**

Run the five RED commands again with `green`/normal modes. Expected: PASS; installed-plugin surface includes `test-design-worker.md`.

- [ ] **Step 5: Commit**

```bash
git add agents/test-design-worker.md skills/test-design/SKILL.md .claude-plugin/plugin.json runtime/core/handoff-agent.mjs runtime/lib/agent-evidence.mjs runtime/test/v05-capability-surface-smoke.mjs runtime/test/plugin-entry-agent-contract-smoke.mjs runtime/test/plugin-agent-surface-smoke.mjs runtime/test/reference-wiring-contract-smoke.mjs runtime/test/skill-first-wiring-smoke.mjs runtime/test/handoff-agent-routing-smoke.mjs runtime/test/test-design-skill-wiring-smoke.mjs
git commit -m "feat: add isolated test design capability"
```

---

### Task 2: Split Architecture Design from detailed test cases

**Files:**
- Modify: `runtime/test/design-semantic-contract-smoke.mjs`
- Modify: `runtime/test/design-skill-script-smoke.mjs`
- Modify: `runtime/test/design-skill-wiring-smoke.mjs`
- Modify: `runtime/test/staged-template-smoke.mjs`
- Modify: `skills/design/SKILL.md`
- Modify: `skills/design/assets/design.md.tmpl`
- Modify: `skills/design/assert/artifact-shape.mjs`
- Modify: `skills/design/assert/traceability.mjs`
- Modify: `skills/design/references/{method,artifact-contract,quality-design,self-check,examples}.md`
- Modify: `skills/review/references/design.md`

**Interfaces:**
- Consumes: requirement IDs `R*`, decision IDs `D*`, evidence IDs `E*`, rollback IDs `RB*`.
- Produces: architecture trace `R* → D* → E* → VO* → RB*`; no `TC*` rows.

- [ ] **Step 1: Write failing VO boundary assertions**

Change the semantic fixture to declare `VO1`/`VO2`. Assert the Architecture Design template and Skill do not contain a detailed test-case table:

```js
assert.match(template, /^## 可验证性义务$/mu);
assert.doesNotMatch(template, /^## 测试设计$/mu);
assert.doesNotMatch(template, /前置条件\s*\|\s*测试数据\s*\|\s*动作/u);
assert.match(skill, /R\* → D\* → E\* → VO\* → RB\*/u);
assert.match(skill, /完整测试用例由独立 `test-design`/u);
```

Traceability must reject `V1` in the VO column and accept only IDs matching `/^VO[1-9][0-9]*$/u`.

- [ ] **Step 2: Run RED Design tests**

```bash
node runtime/test/design-semantic-contract-smoke.mjs red
node runtime/test/design-skill-script-smoke.mjs red
node runtime/test/design-skill-wiring-smoke.mjs red
node runtime/test/staged-template-smoke.mjs red
```

Expected: FAIL because current Design still owns `## 测试设计` and `V*`.

- [ ] **Step 3: Implement VO-only Architecture Design**

Replace `## 测试设计` with:

```markdown
## 可验证性义务

| VOID | Requirement / Decision | 必须可观察的行为 | 主要失败信号 | 后续 Test Design 入口 |
|---|---|---|---|---|
| VO1 | R1 / D1 | | | 由 test-design 映射 TC* |
```

Update trace table’s Verification column to `Verification Obligation` and enforce declared `VO*`. Keep security/concurrency/observability design, but move level selection, cases, data, steps and E2E journey into test-design. Change the architecture review rubric to review whether VO is observable and complete, not whether detailed cases exist.

- [ ] **Step 4: Run GREEN Design tests**

Run the four RED commands in `green` mode. Expected: PASS and the unfilled VO template still blocks finalization.

- [ ] **Step 5: Commit**

```bash
git add runtime/test/design-semantic-contract-smoke.mjs runtime/test/design-skill-script-smoke.mjs runtime/test/design-skill-wiring-smoke.mjs runtime/test/staged-template-smoke.mjs skills/design skills/review/references/design.md
git commit -m "refactor: isolate architecture verification obligations"
```

---

### Task 3: Build the test-design artifact contract

**Files:**
- Create: `runtime/test/test-design-semantic-contract-smoke.mjs`
- Create: `skills/test-design/assets/test-cases.md.tmpl`
- Create: `skills/test-design/references/method.md`
- Create: `skills/test-design/references/artifact-contract.md`
- Create: `skills/test-design/references/self-check.md`
- Create: `skills/test-design/references/examples.md`
- Create: `skills/test-design/assert/artifact-shape.mjs`
- Create: `skills/test-design/assert/coverage.mjs`
- Create: `skills/test-design/assert/traceability.mjs`
- Create: `skills/test-design/evals/evals.json`
- Modify: `skills/test-design/SKILL.md`
- Create: `skills/review/references/test-design.md`

**Interfaces:**
- Consumes: frozen requirements and Architecture Design ID contracts.
- Produces: deterministic `test-cases.md` semantic contract; runtime handoff binding is added in Task 4 after ArchitectureProof exists.

- [ ] **Step 1: Write failing semantic tests**

Create a complete fixture with `R1`, `D1`, `VO1`, `TC1` and assert:

```js
assert.equal(assertArtifactShape(complete, impact).verdict, 'pass');
assert.equal(assertCoverage(requirements, design, complete).verdict, 'pass');
assert.equal(assertTraceability(requirements, design, complete).verdict, 'pass');
```

Add adversarial mutations and require `block` for duplicate `TC1`, unknown `R9/D9/VO9`, empty observable assertion, generic “验证成功”, template placeholders, critical failure with no case, applicable E2E with no journey, and `N/A` without a reason.

- [ ] **Step 2: Run RED test-design tests**

```bash
node runtime/test/test-design-semantic-contract-smoke.mjs red
node runtime/test/test-design-skill-wiring-smoke.mjs red
```

Expected: FAIL because the artifact contract and scripts do not exist.

- [ ] **Step 3: Implement the template and assertions**

Use these exact top-level headings:

```markdown
## 输入与测试范围
## Coverage Matrix
## 测试用例
## E2E 用户旅程
## 测试数据、隔离与清理
## 风险优先级与最小充分集合
## Test Design Self-Check
```

The detailed case table has exactly ten columns:

```markdown
| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |
```

Accept only stable IDs `TC<number>`, known `R/D/VO` refs, levels `unit|integration|contract|migration|security|E2E`, priorities `critical|high|normal`, status `accepted`, and non-placeholder content in every semantic field.

- [ ] **Step 4: Complete Skill instructions, references, rubric and evals**

The Skill flow is marker prepare → frozen inputs only → template → self-check → finalizer → Main independent review. Evals must cover correct generation, `NEEDS_DECISION`, no test execution/browser use, no exact argv, stale input rejection, missing failure paths and applicable E2E.

- [ ] **Step 5: Run GREEN test-design tests**

Run the two RED commands in green mode. Expected: PASS; the Skill names the future scripts but wiring marks them as the Task 4 dependency rather than treating the shell as executable before they exist.

- [ ] **Step 6: Commit**

```bash
git add skills/test-design skills/review/references/test-design.md runtime/test/test-design-semantic-contract-smoke.mjs runtime/test/test-design-skill-wiring-smoke.mjs
git commit -m "feat: define test case design artifact contract"
```

---

### Task 4: Add test-design runtime binding, ArchitectureProof and compound DesignProof gates

**Files:**
- Create: `runtime/test/design-compound-gate-smoke.mjs`
- Create: `runtime/test/design-architecture-proof-cli-smoke.mjs`
- Create: `runtime/test/test-design-skill-script-smoke.mjs`
- Create: `runtime/core/design-proof.mjs`
- Create: `runtime/api/design.mjs`
- Create: `runtime/design.mjs`
- Modify: `runtime/cli.mjs`
- Modify: `runtime/lib/result-contract.mjs`
- Modify: `runtime/lib/stage-results.mjs`
- Modify: `runtime/lib/stage-contract.mjs`
- Modify: `runtime/lib/workflow-audit.mjs`
- Modify: `runtime/lifecycle.mjs`
- Modify: `runtime/test/design-stage-gate-smoke.mjs`
- Modify: `runtime/test/completion-proof-smoke.mjs`
- Modify: `runtime/test/runtime-help-contract-smoke.mjs`
- Create: `skills/test-design/scripts/prepare-input.mjs`
- Create: `skills/test-design/scripts/finalize-result.mjs`

**Interfaces:**
- Produces: `buildDesignArchitectureProof(root, stageResult, reviewResult)` and `buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview)`.
- Produces: `readDesignArchitectureProof(root, changeId)` public API.
- Consumes: two behavior-specific execute/review chains; provides the public proof API required by test-design scripts.

- [ ] **Step 1: Write a compound Design gate RED fixture**

Create valid architecture execute/review and test-design execute/review chains. Assert the gate blocks after only the first chain:

```js
assert.match(validateDesignStageGate(root, changeId).join('\n'), /test-design StageResult is missing/u);
```

After adding both chains and a compound proof, assert `[]`. Mutate architecture proof, design digest, test-case digest, either review verdict, agent identity and parentRunId; each must block.

- [ ] **Step 2: Write ArchitectureProof CLI RED tests**

Run `node runtime/cli.mjs design seal-architecture <change-id>` in a fixture. Before both valid architecture runs exist expect exit 2 and stable code `EH-DESIGN-PROOF-001`; after they exist expect atomic `evidence/completion/design-architecture.json`. A second identical invocation may return the same proof, but a conflicting existing file must fail closed.

Also assert `node runtime/cli.mjs design --help` exits 0, unsafe change IDs fail with `EH-PATH-001`, malformed proof JSON fails closed, and the command uses argv arrays with `shell: false` through the existing CLI launcher.

- [ ] **Step 3: Write failing test-design script tests**

The fixture must create a `design.test-cases` execute handoff and assert prepare rejects:

```js
assert.match(noMarker.stderr, /HANDOFF_INPUT marker is required/u);
assert.match(staleDesign.stderr, /input digest is stale/u);
assert.match(missingArchitectureProof.stderr, /architecture proof must be digest-bound/u);
assert.match(wrongBehavior.stderr, /design\.test-cases/u);
```

Finalizer tests must assert direct immutable persistence at `v2ResultPath`, duplicate finalize rejection, wrong stage rejection and symlink rejection.

- [ ] **Step 4: Run RED proof and script tests**

```bash
node runtime/test/design-compound-gate-smoke.mjs red
node runtime/test/design-architecture-proof-cli-smoke.mjs red
node runtime/test/test-design-skill-script-smoke.mjs red
node runtime/test/design-stage-gate-smoke.mjs red
node runtime/test/completion-proof-smoke.mjs red
```

Expected: FAIL because the runtime still chooses one freshest Design execution.

- [ ] **Step 5: Implement proof schemas**

ArchitectureProof has this closed shape:

```js
{
  proofVersion: 1,
  type: 'design-architecture-proof',
  changeId,
  executionRunId,
  reviewRunId,
  artifacts: [{ path: designRef, digest: designDigest }],
  inputDigests,
  tecpc,
  createdAt,
}
```

Final Design CompletionProof uses:

```js
{
  proofVersion: 1,
  type: 'completion-proof',
  changeId,
  stage: 'design',
  stageProofs: [
    { kind: 'architecture', executionRunId, reviewRunId, artifacts: [designArtifact] },
    { kind: 'test-design', executionRunId, reviewRunId, artifacts: [testCasesArtifact] },
  ],
  artifacts: [designArtifact, testCasesArtifact],
  waivers: [],
  target,
  evidence,
  context,
  path,
  createdAt,
}
```

For `stage=design`, require exactly one of each kind and distinct execute/review identities within each chain. Non-design/non-implement proof schemas keep their current top-level execution/review IDs.

- [ ] **Step 6: Implement marker preparation and immutable finalization**

`prepare-input.mjs` imports only `runtime/api/handoff.mjs`, `runtime/api/task.mjs`, `runtime/api/result.mjs` and the new `runtime/api/design.mjs`. It returns:

```js
{
  changeId,
  runId,
  stage: 'design',
  handoffPath: markerPath,
  inputRefs,
  inputDigests,
  impact,
  outputRef: `harness/changes/${changeId}/test-cases.md`,
}
```

It requires exact agent/skill/behavior/role:

```js
handoff.agent.type === 'enterprise-harness:test-design-worker'
handoff.agent.skill === 'test-design'
handoff.behavior === 'design.test-cases'
handoff.role === 'execute'
```

`finalize-result.mjs` reruns all three assertions, rereads state/proof/digests, creates a StageResult with artifact `test-cases.md`, and calls `persistHandoffV2Result` exactly once.

- [ ] **Step 7: Select Design runs by exact behavior**

Add a helper with this signature:

```js
function completionChainForBehavior(root, changeId, behavior, requiredArtifacts) {
  return { stageResult, reviewResult, producerBindings, reviewerBindings, problems };
}
```

Use exact behaviors `design.produce` and `design.test-cases`; never treat “freshest stage execution” as sufficient for Design. The test-design handoff must digest-bind `design-architecture.json`. `validateDesignStageGate` requires both artifacts and the compound proof.

- [ ] **Step 8: Publish proofs through supported runtime commands**

Expose `design` in `runtime/cli.mjs`. `seal-architecture` validates the first chain and atomically writes ArchitectureProof. During `design → plan`, lifecycle builds and writes compound `design.json`, then rereads it through `stageCompletionFor` before CAS transition.

- [ ] **Step 9: Run GREEN proof tests**

Run the five RED commands in green mode plus `node runtime/test/workflow-audit-v6-result-smoke.mjs verify`. Expected: PASS and audit reports both Design chains.

- [ ] **Step 10: Commit**

```bash
git add runtime/core/design-proof.mjs runtime/api/design.mjs runtime/design.mjs runtime/cli.mjs runtime/lib/result-contract.mjs runtime/lib/stage-results.mjs runtime/lib/stage-contract.mjs runtime/lib/workflow-audit.mjs runtime/lifecycle.mjs skills/test-design/scripts/prepare-input.mjs skills/test-design/scripts/finalize-result.mjs runtime/test/design-compound-gate-smoke.mjs runtime/test/design-architecture-proof-cli-smoke.mjs runtime/test/test-design-skill-script-smoke.mjs runtime/test/design-stage-gate-smoke.mjs runtime/test/completion-proof-smoke.mjs runtime/test/runtime-help-contract-smoke.mjs runtime/test/workflow-audit-v6-result-smoke.mjs
git commit -m "feat: require compound design completion proof"
```

---

### Task 5: Wire Main’s exact Design-stage orchestration

**Files:**
- Modify: `runtime/test/design-skill-wiring-smoke.mjs`
- Modify: `runtime/test/harness-controller-routing-smoke.mjs`
- Create: `runtime/test/design-controller-sequence-smoke.mjs`
- Modify: `skills/harness/references/behavior-map.md`
- Modify: `skills/harness/references/downstream-pitfalls.md`
- Modify: `skills/review/SKILL.md`
- Modify: `runtime/lib/review-rubrics.mjs`
- Modify: `harness/policy.json`

**Interfaces:**
- Consumes: Design stage runtime status and ArchitectureProof path.
- Produces: one deterministic next action among architecture execute, architecture review, seal architecture, test-design execute, test-design review and transition.

- [ ] **Step 1: Write failing controller sequence tests**

Assert `behavior-map.md` contains both exact execute commands and the proof seal command:

```text
handoff create <change-id> design design.produce execute
design seal-architecture <change-id>
handoff create <change-id> design design.test-cases execute
```

The test-design handoff command must include `requirements.md`, classification, `design.md`, and `evidence/completion/design-architecture.json`. Assert Main passes only the emitted `HANDOFF_INPUT=` line to `enterprise-harness:test-design`.

- [ ] **Step 2: Run RED controller tests**

```bash
node runtime/test/design-controller-sequence-smoke.mjs red
node runtime/test/design-skill-wiring-smoke.mjs red
node runtime/test/harness-controller-routing-smoke.mjs red
```

Expected: FAIL because the controller only knows one Design worker.

- [ ] **Step 3: Implement one-action routing and separate rubrics**

Document this ordered recovery projection:

```text
missing/stale architecture result → design.produce
missing/stale architecture review → review(design)
missing/stale ArchitectureProof → design seal-architecture
missing/stale test-design result → design.test-cases
missing/stale test-design review → review(test-design)
both chains fresh → design transition
```

Add rubric ID `test-design`; `selectReviewRubrics` returns architecture impact rubrics for `design.produce` and `['test-design']` plus applicable risk rubrics for `design.test-cases`. If the current API accepts only stage/impact, extend it to `{ stage, behavior, impact }` and update every caller/test.

- [ ] **Step 4: Run GREEN controller tests**

Run the three RED commands in green mode plus `node runtime/test/review-rubric-selector-smoke.mjs verify`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/harness/references/behavior-map.md skills/harness/references/downstream-pitfalls.md skills/review/SKILL.md runtime/lib/review-rubrics.mjs harness/policy.json runtime/test/design-controller-sequence-smoke.mjs runtime/test/design-skill-wiring-smoke.mjs runtime/test/harness-controller-routing-smoke.mjs runtime/test/review-rubric-selector-smoke.mjs
git commit -m "feat: orchestrate architecture and test design chains"
```

---

### Task 6: Bind test cases into Plan, Implement, Verify and Archive

**Files:**
- Create: `runtime/test/test-cases-downstream-binding-smoke.mjs`
- Modify: `runtime/test/plan-skill-script-smoke.mjs`
- Modify: `runtime/test/verify-skill-script-smoke.mjs`
- Modify: `runtime/test/archive-contract-smoke.mjs`
- Modify: `runtime/test/artifact-dependency-v5-smoke.mjs`
- Modify: `skills/plan/SKILL.md`
- Modify: `skills/plan/scripts/prepare-input.mjs`
- Modify: `skills/plan/scripts/finalize-result.mjs`
- Modify: `skills/plan/references/{method,artifact-contract,self-check}.md`
- Modify: `skills/verify/SKILL.md`
- Modify: `skills/verify/scripts/prepare-input.mjs`
- Modify: `skills/archive/SKILL.md`
- Modify: `runtime/lib/artifacts.mjs`
- Modify: `runtime/lib/execution-prerequisites.mjs`
- Modify: `runtime/lib/stage-contract.mjs`
- Modify: `runtime/lib/stage-results.mjs`

**Interfaces:**
- Consumes: fresh `test-cases.md` digest and compound DesignProof.
- Produces: Plan/Verify/Archive evidence chains that become stale when test cases change.

- [ ] **Step 1: Write downstream RED tests**

For Plan prepare, omit `test-cases.md` and expect `test-cases input must be digest-bound`. For Verify, mutate test cases after handoff and expect stale input rejection. For Archive, remove test cases and expect missing required artifact. Add a dependency assertion:

```js
assert.deepEqual(graph.plan, ['design', 'testCases']);
assert.deepEqual(graph.validation, ['requirements', 'design', 'testCases', 'plan', 'evidence']);
```

- [ ] **Step 2: Run RED downstream tests**

```bash
node runtime/test/test-cases-downstream-binding-smoke.mjs red
node runtime/test/plan-skill-script-smoke.mjs red
node runtime/test/verify-skill-script-smoke.mjs red
node runtime/test/archive-contract-smoke.mjs red
```

Expected: FAIL because downstream stages do not require test cases.

- [ ] **Step 3: Implement Plan and execution prerequisite binding**

Plan prepare/finalize must require current `design.md`, `test-cases.md` and compound DesignProof in inputRefs. Each Task maps implementation work and frozen validation commands to one or more `TC*`; a TDD task additionally identifies the minimal RED case. Execution prerequisites reject a plan whose test-case digest no longer matches.

- [ ] **Step 4: Implement Verify and Archive binding**

Verify consumes every accepted `TC*`, records executed/skipped/unsupported status and receipts, and requires applicable E2E critical journeys. `unsupported` remains non-pass. Archive manifest includes `test-cases.md`, test-design result/review and DesignProof references.

- [ ] **Step 5: Run GREEN downstream tests**

Run the four RED commands in green mode plus artifact invalidation, execution prerequisites and workflow audit tests. Expected: PASS; mutating `test-cases.md` makes Plan and validation stale.

- [ ] **Step 6: Commit**

```bash
git add skills/plan skills/verify skills/archive runtime/lib/artifacts.mjs runtime/lib/execution-prerequisites.mjs runtime/lib/stage-contract.mjs runtime/lib/stage-results.mjs runtime/test/test-cases-downstream-binding-smoke.mjs runtime/test/plan-skill-script-smoke.mjs runtime/test/verify-skill-script-smoke.mjs runtime/test/archive-contract-smoke.mjs runtime/test/artifact-dependency-v5-smoke.mjs
git commit -m "feat: trace test cases through delivery stages"
```

---

### Task 7: Update truth layers, packaging, evals and release version

**Files:**
- Modify: `README.md`
- Modify: `docs/user/workflow.md`
- Modify: `docs/maintainer/runtime-sequence.md`
- Modify: `harness/specs/{README,workflow,architecture,evidence,stage-observability,development-target}.md`
- Modify: `test/skill-evals/harness/evals.json`
- Modify: `runtime/test/clarify-eval-runner-smoke.mjs`
- Modify: `runtime/test/docs-consistency-smoke.mjs`
- Modify: `runtime/test/skill-packaging-smoke.mjs`
- Modify: `runtime/test/native-plugin-layout-smoke.mjs`
- Modify: `runtime/test/installed-plugin-e2e.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`
- Generate: `.claude-plugin/marketplace.json`
- Generate: `.claude-plugin/plugin.json`
- Generate: `harness/plugin/manifest.json`

**Interfaces:**
- Consumes: all implemented contracts from Tasks 1–6.
- Produces: installable `enterprise-harness@0.5.12` and aligned human/runtime truth layers.

- [ ] **Step 1: Write packaging and documentation RED assertions**

Require installed Skill/agent files, version `0.5.12`, six-stage text plus compound Design internal sequence, and no statement that Design owns detailed test cases. The external plugin E2E must verify discovery of `enterprise-harness:test-design` and `enterprise-harness:test-design-worker`.

- [ ] **Step 2: Run RED packaging tests**

```bash
node runtime/test/skill-packaging-smoke.mjs red
node runtime/test/native-plugin-layout-smoke.mjs red
node runtime/test/docs-consistency-smoke.mjs red
node runtime/test/clarify-eval-runner-smoke.mjs red
```

Expected: FAIL on missing surface/version/documentation.

- [ ] **Step 3: Update specs and user/maintainer docs**

Keep one authority per rule: workflow/spec files define contracts; user docs explain behavior without copying schemas; maintainer docs show exact sequence. Update every changed spec’s `status`, `owner`, `lastVerified`, `implementationRefs` and `testRefs`, then update `harness/specs/README.md`.

- [ ] **Step 4: Bump and synchronize version**

Change `package.json` to `0.5.12`, then run:

```bash
node bin/sync-version.mjs
npm install --package-lock-only --ignore-scripts --offline
node bin/sync-version.mjs --check
```

Add a 2026-08-28 changelog entry covering the independent test-design Skill, compound DesignProof and downstream test-case trace.

- [ ] **Step 5: Run GREEN packaging tests**

Run the four RED commands in green mode and `claude plugin validate .`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/user/workflow.md docs/maintainer/runtime-sequence.md harness/specs test/skill-evals/harness/evals.json runtime/test/clarify-eval-runner-smoke.mjs runtime/test/docs-consistency-smoke.mjs runtime/test/skill-packaging-smoke.mjs runtime/test/native-plugin-layout-smoke.mjs runtime/test/installed-plugin-e2e.mjs package.json package-lock.json CHANGELOG.md .claude-plugin/marketplace.json .claude-plugin/plugin.json harness/plugin/manifest.json
git commit -m "release: prepare enterprise harness 0.5.12"
```

---

### Task 8: Fresh verification, independent review, push and local update

**Files:**
- Verify only; modify files only to fix evidence-backed failures through a new RED→GREEN cycle.

**Interfaces:**
- Consumes: committed Tasks 1–7.
- Produces: clean main branch, remote commit and installed local `0.5.12`.

- [ ] **Step 1: Run focused verification**

```bash
node runtime/test/design-semantic-contract-smoke.mjs verify
node runtime/test/design-skill-script-smoke.mjs verify
node runtime/test/test-design-semantic-contract-smoke.mjs verify
node runtime/test/test-design-skill-script-smoke.mjs verify
node runtime/test/design-compound-gate-smoke.mjs verify
node runtime/test/design-controller-sequence-smoke.mjs verify
node runtime/test/test-cases-downstream-binding-smoke.mjs verify
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 2: Run full release verification**

```bash
npm run prepublish-check
npm run quality:local
```

Expected: both exit 0. If Context7 or another external capability is unavailable, report the exact blocker and do not replace this evidence with a partial success claim.

- [ ] **Step 3: Perform independent review**

Review the final diff against the spec with a different agent identity. It must explicitly check official Skill frontmatter, context isolation, handoff identity, two independent review chains, compound proof freshness, TC trace semantics, symlink/path safety, public runtime API imports and downstream stale propagation.

- [ ] **Step 4: Verify repository state and push**

```bash
git status --short
git diff --check
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

Expected: clean status and identical local/remote commit IDs.

- [ ] **Step 5: Refresh the project-local plugin**

```bash
claude plugin marketplace update enterprise-harness
claude plugin update enterprise-harness@enterprise-harness --scope local --yes
claude plugin list
```

Expected: current project shows enabled version `0.5.12`; inform the user that Claude Code must restart to apply it.
