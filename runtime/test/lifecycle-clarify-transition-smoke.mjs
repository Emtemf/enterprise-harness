import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeClassificationArtifact } from '../core/classification-artifact.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-lifecycle-clarify-gate-'));
const changeId = 'clarify-transition';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

function advance() {
  return spawnSync(process.execPath, [lifecycle, 'state', changeId, 'design'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Clarify transition\n');
  const classification = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification },
    validation: { status: 'stale', digest: null, validatedAt: null },
  }, null, 2)}\n`);

  const tecpc = {
    target: 'confirm requirements and classification',
    evidence: [requirementsRef, classification.path],
    context: [requirementsRef],
    path: `${requirementsRef} -> ${classification.path}`,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: [requirementsRef, classification.path],
    tecpc,
  });
  const completeArtifacts = [requirementsRef, classification.path]
    .map((artifactPath) => ({ path: artifactPath, digest: sha256Artifact(root, artifactPath) }));
  const incompleteArtifacts = completeArtifacts.filter((artifact) => artifact.path !== classification.path);
  const stageResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts: incompleteArtifacts,
    assertions: [{ id: 'scope-confirmed', verdict: 'pass', evidence: [requirementsRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [requirementsRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-16T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));

  const check = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [requirementsRef, classification.path],
    tecpc,
  });
  const reviewPath = v2ResultPath(root, changeId, check.runId, 'check');
  const review = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'clarify',
    runId: check.runId,
    parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: execute.runId,
    reviewedArtifacts: incompleteArtifacts,
    rubricIds: [...check.input.rubricIds],
    tecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-16T00:00:01.000Z',
  };
  fs.writeFileSync(reviewPath, JSON.stringify(review));
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'agent-clarify-review' });

  const missingBinding = advance();
  assert.equal(missingBinding.status, 2, missingBinding.stderr || missingBinding.stdout);
  assert.match(`${missingBinding.stdout}\n${missingBinding.stderr}`, /does not bind.*classification\.json/u);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'clarify');

  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify({
    ...stageResult,
    artifacts: completeArtifacts,
    selfCheck: { ...stageResult.selfCheck, evidence: [requirementsRef, classification.path] },
  }));
  fs.writeFileSync(reviewPath, JSON.stringify({ ...review, reviewedArtifacts: completeArtifacts }));
  const advanced = advance();
  assert.equal(advanced.status, 0, advanced.stderr || advanced.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'design');

  console.log(`PASS lifecycle-clarify-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
