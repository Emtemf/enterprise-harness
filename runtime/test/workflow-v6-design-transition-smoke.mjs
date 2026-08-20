import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateV6State } from '../core/change-state.mjs';
import { validateStageGate } from '../lib/stage-results.mjs';
import {
  applyV6DesignReadinessDecision,
  inferCurrentGap,
  inferPendingDecision,
} from '../lib/workflow.mjs';

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function writeJson(root, relativePath, value) {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const runner = fs.readFileSync(path.join(root, 'runtime', 'workflow.mjs'), 'utf-8');
const data = {
  schemaVersion: 6,
  revision: 1,
  changeId: 'design-transition-probe',
  lifecycle: 'active',
  stage: 'design',
  currentTask: null,
  artifacts: {
    classification: {
      path: 'harness/changes/design-transition-probe/classification.json',
      digest: 'a'.repeat(64),
    },
  },
  blocker: null,
  validation: { status: 'missing', digest: null, validatedAt: null },
};
assert.deepEqual(validateV6State(data, data.changeId), []);

assert.throws(
  () => applyV6DesignReadinessDecision(data, 'freeze-slice', {
    stageProblems: ['ReviewResult is missing'],
  }),
  /EH-WORKFLOW-STAGE-GATE-008.*ReviewResult is missing/u,
);
const planned = applyV6DesignReadinessDecision(data, 'freeze-slice', { stageProblems: [] });
assert.notEqual(planned, data);
assert.equal(data.stage, 'design');
assert.equal(planned.stage, 'plan');
assert.ok(!Object.hasOwn(planned, 'workflow'), 'v6 transition must not reintroduce projection booleans');
assert.deepEqual(validateV6State(planned, planned.changeId), []);
const revised = applyV6DesignReadinessDecision(planned, 'revise-slice', { stageProblems: [] });
assert.equal(revised.stage, 'design');
assert.ok(!Object.hasOwn(revised, 'workflow'));
assert.deepEqual(validateV6State(revised, revised.changeId), []);

const blocked = inferPendingDecision(
  data.changeId,
  data,
  'design',
  'design gate is blocked',
  () => false,
  { designGateProblems: ['ReviewResult is missing'] },
);
assert.equal(blocked, null, 'v6 design must not expose a transition while the result gate blocks');

const ready = inferPendingDecision(
  data.changeId,
  data,
  'design',
  'execution deepening 第一批切片待冻结。',
  () => false,
  { designGateProblems: [] },
);
assert.deepEqual(ready, {
  kind: 'execution-readiness',
  message: 'execution deepening 第一批切片待冻结。',
  options: ['freeze-slice', 'revise-slice'],
  defaultDecision: 'freeze-slice',
  evidence: ['harness/changes/design-transition-probe/design.md'],
});

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v6-design-transition-'));
try {
  fs.mkdirSync(path.join(fixtureRoot, 'harness', 'changes', data.changeId), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'harness', 'changes', data.changeId, 'design.md'), '# Design\n');
  assert.equal(
    inferCurrentGap(fixtureRoot, data.changeId, data, 'design', ['ReviewResult is missing']),
    'design result gate blocked: ReviewResult is missing',
  );
  assert.equal(
    inferCurrentGap(fixtureRoot, data.changeId, data, 'design', []),
    'execution deepening 第一批切片待冻结。',
  );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
const selectionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-v6-design-selection-'));
try {
  const changeId = 'design-selection-probe';
  const requirementsPath = `harness/changes/${changeId}/requirements.md`;
  const designPath = `harness/changes/${changeId}/design.md`;
  const oldExecuteRunId = 'run_11111111-1111-4111-8111-111111111111';
  const oldCheckRunId = 'run_22222222-2222-4222-8222-222222222222';
  const newExecuteRunId = 'run_ffffffff-ffff-4fff-8fff-ffffffffffff';
  const oldCreatedAt = '2026-08-17T00:00:00.000Z';
  const newCreatedAt = '2026-08-17T01:00:00.000Z';
  const oldRequirements = '# Requirements\nold\n';
  const newRequirements = '# Requirements\nnew\n';
  const designText = '# Design\n';

  spawnSync('git', ['init', '-q', '.'], { cwd: selectionRoot });
  fs.mkdirSync(path.join(selectionRoot, 'harness', 'changes', changeId, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(selectionRoot, requirementsPath), oldRequirements, 'utf-8');
  fs.writeFileSync(path.join(selectionRoot, designPath), designText, 'utf-8');

  const designDigest = sha256(designText);
  const oldRequirementsDigest = sha256(oldRequirements);
  const newRequirementsDigest = sha256(newRequirements);

  const makeExecuteInput = (runId, createdAt, digest) => ({
    handoffVersion: 2,
    runId,
    changeId,
    stage: 'design',
    behavior: 'produce',
    role: 'execute',
    parentRunId: null,
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    tecpc: { target: 'design slice', evidence: [], context: [], path: 'design slice', correction: null },
    inputRefs: [requirementsPath],
    inputDigests: { [requirementsPath]: digest },
    rubricIds: [],
    createdAt,
  });

  const makeStageResult = (runId, digest, completedAt) => ({
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { [requirementsPath]: digest },
    artifacts: [{ path: designPath, digest: designDigest }],
    assertions: [{ id: 'design-shape', verdict: 'pass', evidence: [designPath] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designPath] },
    tecpc: {
      target: 'design slice',
      evidence: [designPath],
      context: [requirementsPath],
      path: 'design slice',
      correction: null,
    },
    status: 'pass',
    needsDecision: null,
    completedAt,
  });

  const makeReviewResult = (runId, parentRunId, reviewedRunId, reviewedAt) => ({
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId,
    parentRunId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId,
    reviewedArtifacts: [{ path: designPath, digest: designDigest }],
    rubricIds: ['design', 'architecture', 'rule', 'security'],
    tecpc: {
      target: 'design review',
      evidence: [designPath],
      context: [requirementsPath],
      path: 'design review',
      correction: null,
    },
    verdict: 'pass',
    correction: null,
    reviewedAt,
  });

  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${oldExecuteRunId}/input.json`, makeExecuteInput(oldExecuteRunId, oldCreatedAt, oldRequirementsDigest));
  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${oldExecuteRunId}/result.json`, makeStageResult(oldExecuteRunId, oldRequirementsDigest, oldCreatedAt));
  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${oldCheckRunId}/input.json`, {
    handoffVersion: 2,
    runId: oldCheckRunId,
    changeId,
    stage: 'design',
    behavior: 'review',
    role: 'check',
    parentRunId: oldExecuteRunId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    tecpc: { target: 'design review', evidence: [], context: [], path: 'design review', correction: null },
    inputRefs: [requirementsPath],
    inputDigests: { [requirementsPath]: oldRequirementsDigest },
    rubricIds: ['design', 'architecture', 'rule', 'security'],
    createdAt: oldCreatedAt,
  });
  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${oldCheckRunId}/check.json`, makeReviewResult(oldCheckRunId, oldExecuteRunId, oldExecuteRunId, oldCreatedAt));

  fs.writeFileSync(path.join(selectionRoot, requirementsPath), newRequirements, 'utf-8');
  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${newExecuteRunId}/input.json`, makeExecuteInput(newExecuteRunId, newCreatedAt, newRequirementsDigest));
  writeJson(selectionRoot, `.git/enterprise-harness/runs/${changeId}/${newExecuteRunId}/result.json`, makeStageResult(newExecuteRunId, newRequirementsDigest, newCreatedAt));

  const problems = validateStageGate(selectionRoot, changeId, 'design', {
    requiredArtifactPath: designPath,
  });
  assert.ok(
    problems.some((problem) => problem.includes(newExecuteRunId) && (
      problem.includes('execute handoff has no trusted completed agent binding')
      || problem.includes('ReviewResult is missing')
      || problem.includes('fresh, independent passing ReviewResult')
    )),
    `Expected the freshest execute run to drive the gate, got ${JSON.stringify(problems)}`,
  );
  assert.ok(
    problems.every((problem) => !problem.includes(oldExecuteRunId) && !problem.includes(oldCheckRunId) && !problem.includes('stale')),
    `Stale historical runs should be ignored, got ${JSON.stringify(problems)}`,
  );
} finally {
  fs.rmSync(selectionRoot, { recursive: true, force: true });
}

assert.match(runner, /validateStageGate\(root, changeId, 'design'/u);
assert.match(runner, /applyV6DesignReadinessDecision/u);
assert.match(runner, /data\.schemaVersion === 6/u);

console.log(`PASS workflow-v6-design-transition ${mode}`);
