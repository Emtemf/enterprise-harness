import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { auditWorkflow } from '../lib/workflow-audit.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-workflow-audit-v6-'));
const changeId = 'audit-design';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const changeDir = path.join(root, 'harness', 'changes', changeId);

const state = {
  schemaVersion: 6,
  revision: 1,
  changeId,
  lifecycle: 'active',
  stage: 'plan',
  impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  classification: { tier: 'L1', impact: 'low' },
  artifacts: {},
  validation: { status: 'stale', digest: null, validatedAt: null },
};

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Audit design\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');

  const missing = auditWorkflow(root, changeId, state);
  const missingDesign = missing.stages.find((stage) => stage.stage === 'design');
  assert.equal(missing.verdict, 'block');
  assert.equal(missingDesign.status, 'block');
  assert.ok(missingDesign.results.some((result) => result.status === 'block'));

  const tecpc = {
    target: 'audit design result',
    evidence: [designRef],
    context: [requirementsRef],
    path: designRef,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));
  const check = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc,
  });
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: ['design'],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, check.runId, 'check'), JSON.stringify(review));

  const complete = auditWorkflow(root, changeId, state);
  const completeDesign = complete.stages.find((stage) => stage.stage === 'design');
  assert.equal(complete.verdict, 'pass');
  assert.equal(completeDesign.status, 'pass');
  assert.deepEqual(completeDesign.results.map((result) => result.status), ['pass']);

  console.log(`PASS workflow-audit-v6-result ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
