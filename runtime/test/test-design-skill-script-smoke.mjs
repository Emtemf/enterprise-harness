import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const prepare = path.join(repoRoot, 'skills/test-design/scripts/prepare-input.mjs');
const finalize = path.join(repoRoot, 'skills/test-design/scripts/finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-test-design-script-'));
const changeId = 'test-design-script';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

function markerFor(handoff) {
  return `HANDOFF_INPUT=${path.relative(root, handoff.path).split(path.sep).join('/')}`;
}

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

const design = [
  '# Design',
  '## 目标与验收',
  '- 覆盖 R1。',
  '## 事实与约束',
  '| EID | 来源 | 已确认事实 |',
  '|---|---|---|',
  `| E1 | ${requirementsRef} | 用户可提交退款 |`,
  '## 方案与权衡',
  '### Alternatives',
  '| 方案 | 优点 | 代价/风险 | 结论 |',
  '|---|---|---|---|',
  '| A | 复用服务 | 保持边界 | 采用 |',
  '| B | 新建服务 | 增加部署成本 | 拒绝 |',
  '### Decisions',
  '| DID | Context（EID） | Decision | Consequences | Status |',
  '|---|---|---|---|---|',
  '| D1 | E1 | 复用退款服务 | 保持事务边界 | accepted |',
  '## Requirement Trace',
  '| Requirement | Decision | Evidence | Verification Obligation | Rollback |',
  '|---|---|---|---|---|',
  '| R1 | D1 | E1 | VO1 | RB1 |',
  '## 架构边界',
  '- 入口委托退款服务。',
  '## 交互与失败路径',
  '- 请求经入口到退款服务，失败保留稳定错误。',
  '## API 设计',
  '- N/A：本 fixture 不改变 API。',
  '## 数据与 SQL 设计',
  '- N/A：本 fixture 不改变数据结构。',
  '## 安全、并发与可观测性',
  '- 认证身份与退款标识可观察。',
  '## 可验证性义务',
  '| VOID | Requirement / Decision | 必须可观察的行为 | 主要失败信号 | 后续 Test Design 入口 |',
  '|---|---|---|---|---|',
  '| VO1 | R1 / D1 | 返回唯一退款标识 | 未返回标识或重复创建 | 由 test-design 映射 TC* |',
  '## 风险、兼容与回滚',
  '| RID | 触发条件 | 回滚动作 | 回滚后验证 |',
  '|---|---|---|---|',
  '| RB1 | 错误率升高 | 恢复旧入口 | 旧入口返回退款标识 |',
  '## Design Self-Check',
  '- verdict：pass',
  '- unresolved decisions：none',
  '- downstream findings：none',
].join('\n');

const testCases = [
  '# Test Cases',
  '## 输入与测试范围',
  '| Dimension | Applicability | Reason |',
  '|---|---|---|',
  '| E2E | applicable | 用户提交退款并看到结果 |',
  '## Coverage Matrix',
  '| Source | Concern | Criticality | Applicability | Covered By | N/A Reason |',
  '|---|---|---|---|---|---|',
  '| R1 | 合法退款成功 | normal | applicable | TC1 | - |',
  '| VO1 | 重复创建失败信号 | critical | applicable | TC2 | - |',
  '| migration | 数据迁移 | normal | N/A | - | 本变更不修改数据结构 |',
  '## 测试用例',
  '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
  '|---|---|---|---|---|---|---|---|---|---|',
  '| TC1 | R1 / D1 / VO1 | integration | high | 用户已认证且退款服务可用 | 合法退款请求 refund-001 | 提交一次退款请求 | 响应包含非空退款标识且退款记录数量为1 | 删除 refund-001 的退款记录 | accepted |',
  '| TC2 | R1 / D1 / VO1 | contract | critical | 用户已认证且已提交 refund-001 | 重复退款请求 refund-001 | 再次提交相同退款请求 | 返回相同退款标识且退款记录数量仍为1 | 删除 refund-001 的退款记录 | accepted |',
  '## E2E 用户旅程',
  '| Journey ID | Traces | Preconditions | Steps | Observable outcome | Status |',
  '|---|---|---|---|---|---|',
  '| J1 | R1 / D1 / VO1 / TC1 | 用户已登录退款页面 | 输入 refund-001 并提交退款 | 页面显示非空退款标识且刷新后仍存在 | accepted |',
  '## 测试数据、隔离与清理',
  '- refund-001 每次运行唯一；完成后删除退款记录。',
  '## 风险优先级与最小充分集合',
  '- TC2 覆盖 critical 重复创建风险；TC1 与 J1 覆盖最短成功路径。',
  '## Test Design Self-Check',
  '- verdict：pass',
  '- unresolved decisions：none',
  '- placeholders：none',
].join('\n');

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(
    path.join(root, requirementsRef),
    approvedRequirements().replace(
      '## 事实探索门禁',
      '### 验收\n- R1：已认证用户提交退款后返回退款标识。\n## 事实探索门禁',
    ),
  );
  const impact = { api: 'no', data: 'no', architecture: 'yes', rule: 'yes', security: 'yes' };
  const classification = writeClassificationArtifact(root, changeId, { impact });
  writeJson(path.join(changeDir, 'state.json'), {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  fs.writeFileSync(path.join(root, designRef), design);
  fs.writeFileSync(path.join(root, testCasesRef), testCases);

  const architectureTecpc = {
    target: 'produce architecture', evidence: [designRef], context: [requirementsRef, classification.path],
    path: `${requirementsRef} -> ${designRef}`, correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef, classification.path],
    tecpc: architectureTecpc,
  });
  const architectureResult = {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'design', runId: architectureExecute.runId,
    producer: { agentType: architectureExecute.input.agent.type, skill: architectureExecute.input.agent.skill },
    inputDigests: { ...architectureExecute.input.inputDigests },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'architecture-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc: architectureTecpc, status: 'pass', needsDecision: null,
    completedAt: '2026-08-28T00:00:00.000Z',
  };
  const architectureResultPath = v2ResultPath(root, changeId, architectureExecute.runId);
  writeJson(architectureResultPath, architectureResult);
  const architectureCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: architectureExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc: architectureTecpc,
  });
  const architectureReview = {
    resultVersion: 1, type: 'review-result', changeId, stage: 'design', runId: architectureCheck.runId,
    parentRunId: architectureExecute.runId,
    reviewer: { agentType: architectureCheck.input.agent.type, skill: architectureCheck.input.agent.skill },
    reviewedRunId: architectureExecute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: [...architectureCheck.input.rubricIds], tecpc: architectureTecpc,
    verdict: 'pass', correction: null, reviewedAt: '2026-08-28T00:00:01.000Z',
  };
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);
  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  writeJson(path.join(root, architectureProofRef), architectureProof);
  const architectureResultRef = path.relative(root, architectureResultPath).split(path.sep).join('/');
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'architecture-script-executor' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'architecture-script-reviewer' });

  const forgedProof = {
    ...architectureProof,
    reviewRunId: 'run_ffffffff-ffff-4fff-8fff-ffffffffffff',
  };
  writeJson(path.join(root, architectureProofRef), forgedProof);
  const forgedHandoff = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, classification.path, designRef, architectureResultRef, architectureProofRef],
    tecpc: {
      target: 'reject handwritten architecture proof', evidence: [testCasesRef],
      context: [designRef, architectureProofRef], path: architectureProofRef, correction: null,
    },
  });
  const forgedPrepare = run(prepare, [markerFor(forgedHandoff)]);
  const forgedFinalize = run(finalize, [changeId, forgedHandoff.runId]);
  assert.deepEqual(
    { prepare: forgedPrepare.status, finalize: forgedFinalize.status },
    { prepare: 2, finalize: 2 },
    'prepare and finalize must reject a handwritten proof without its claimed review run or trusted architecture bindings',
  );
  assert.match(
    `${forgedPrepare.stderr}\n${forgedFinalize.stderr}`,
    /canonical architecture binding|architecture.*ReviewResult|trusted.*binding/iu,
  );
  writeJson(path.join(root, architectureProofRef), architectureProof);

  const noMarker = run(prepare, []);
  assert.notEqual(noMarker.status, 0);
  assert.match(noMarker.stderr, /HANDOFF_INPUT marker is required/u);

  const handoffTecpc = {
    target: 'produce test cases', evidence: [testCasesRef],
    context: [requirementsRef, classification.path, designRef, architectureProofRef],
    path: `${architectureProofRef} -> ${testCasesRef}`, correction: null,
  };
  const withoutProof = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, classification.path, designRef, architectureResultRef],
    tecpc: handoffTecpc,
  });
  const missingArchitectureProof = run(prepare, [markerFor(withoutProof)]);
  assert.notEqual(missingArchitectureProof.status, 0);
  assert.match(missingArchitectureProof.stderr, /architecture proof must be digest-bound/u);

  const wrongBehavior = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.other',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef, classification.path, designRef, architectureResultRef, architectureProofRef],
    tecpc: handoffTecpc,
  });
  const wrongBehaviorResult = run(prepare, [markerFor(wrongBehavior)]);
  assert.notEqual(wrongBehaviorResult.status, 0);
  assert.match(wrongBehaviorResult.stderr, /design\.test-cases/u);

  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, classification.path, designRef, architectureResultRef, architectureProofRef],
    tecpc: handoffTecpc,
  });
  const originalDesign = fs.readFileSync(path.join(root, designRef), 'utf-8');
  fs.appendFileSync(path.join(root, designRef), '\nstale\n');
  const staleDesign = run(prepare, [markerFor(handoff)]);
  assert.notEqual(staleDesign.status, 0);
  assert.match(staleDesign.stderr, /input digest is stale/u);
  fs.writeFileSync(path.join(root, designRef), originalDesign);

  const prepared = run(prepare, [markerFor(handoff)]);
  assert.equal(prepared.status, 0, prepared.stderr);
  const preparedInput = JSON.parse(prepared.stdout);
  assert.deepEqual(preparedInput, {
    changeId,
    runId: handoff.runId,
    stage: 'design',
    handoffPath: markerFor(handoff).slice('HANDOFF_INPUT='.length),
    inputRefs: handoff.input.inputRefs,
    inputDigests: handoff.input.inputDigests,
    impact,
    outputRef: testCasesRef,
  });

  const statePath = path.join(changeDir, 'state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  writeJson(statePath, { ...state, stage: 'plan' });
  const wrongStage = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(wrongStage.status, 0);
  assert.match(wrongStage.stderr, /must still be at design stage/u);
  writeJson(statePath, state);

  if (process.platform !== 'win32') {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-test-design-outside-'));
    const outsideCases = path.join(outside, 'test-cases.md');
    fs.writeFileSync(outsideCases, testCases);
    fs.unlinkSync(path.join(root, testCasesRef));
    fs.symlinkSync(outsideCases, path.join(root, testCasesRef));
    const symlinked = run(finalize, [changeId, handoff.runId]);
    assert.notEqual(symlinked.status, 0);
    assert.match(symlinked.stderr, /symbolic-link component/u);
    fs.unlinkSync(path.join(root, testCasesRef));
    fs.writeFileSync(path.join(root, testCasesRef), testCases);
    fs.rmSync(outside, { recursive: true, force: true });
  }

  const finalized = run(finalize, [changeId, handoff.runId]);
  assert.equal(finalized.status, 0, finalized.stderr);
  const result = JSON.parse(finalized.stdout);
  assert.equal(result.type, 'stage-result');
  assert.equal(result.status, 'pass');
  assert.equal(result.producer.agentType, 'enterprise-harness:test-design-worker');
  assert.deepEqual(result.inputDigests, handoff.input.inputDigests);
  const durable = v2ResultPath(root, changeId, handoff.runId);
  assert.deepEqual(JSON.parse(fs.readFileSync(durable, 'utf-8')), result);

  const duplicate = run(finalize, [changeId, handoff.runId]);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /durable result already exists/u);

  console.log(`PASS test-design-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
