import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildCompoundDesignProof, buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { validateDesignStageGate } from '../lib/stage-results.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-gate-'));
const changeId = 'design-gate';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function resultFor(input, artifactRef, producer, completedAt) {
  return {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'design', runId: input.runId,
    producer, inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    assertions: [{ id: `${producer.skill}-shape`, verdict: 'pass', evidence: [artifactRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [artifactRef] },
    tecpc: { ...input.tecpc }, status: 'pass', needsDecision: null, completedAt,
  };
}

function reviewFor(input, parent, artifactRef, reviewedAt) {
  return {
    resultVersion: 1, type: 'review-result', changeId, stage: 'design', runId: input.runId,
    parentRunId: parent.runId, reviewer: { agentType: input.agent.type, skill: input.agent.skill },
    reviewedRunId: parent.runId,
    reviewedArtifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    rubricIds: [...input.rubricIds], tecpc: { ...input.tecpc }, verdict: 'pass', correction: null, reviewedAt,
  };
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  const classification = writeClassificationV2Fixture(root, changeId);
  writeJson(path.join(root, 'harness', 'changes', changeId, 'state.json'), {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n');

  const architectureTecpc = {
    target: 'design', evidence: [designRef], context: [requirementsRef],
    path: `${requirementsRef} -> ${designRef}`, correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef], tecpc: architectureTecpc,
  });
  const architectureResult = resultFor(
    architectureExecute.input, designRef,
    { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    '2026-08-28T00:00:00.000Z',
  );
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), architectureResult);
  const architectureCheck = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.review', role: 'check',
    parentRunId: architectureExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef], tecpc: architectureTecpc,
  });
  const architectureReview = reviewFor(
    architectureCheck.input, architectureExecute.input, designRef, '2026-08-28T00:00:01.000Z',
  );
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'design-executor' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'design-reviewer' });
  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  writeJson(path.join(root, architectureProofRef), architectureProof);

  const testTecpc = {
    target: 'test design', evidence: [testCasesRef], context: [designRef, architectureProofRef],
    path: `${architectureProofRef} -> ${testCasesRef}`, correction: null,
  };
  const testExecute = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [designRef, architectureProofRef], tecpc: testTecpc,
  });
  const testResult = resultFor(
    testExecute.input, testCasesRef,
    { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    '2026-08-28T00:00:02.000Z',
  );
  writeJson(v2ResultPath(root, changeId, testExecute.runId), testResult);
  const testCheck = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.test-cases.review', role: 'check',
    parentRunId: testExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [testCasesRef], tecpc: testTecpc,
  });
  const testReview = reviewFor(testCheck.input, testExecute.input, testCasesRef, '2026-08-28T00:00:03.000Z');
  writeJson(v2ResultPath(root, changeId, testCheck.runId, 'check'), testReview);
  appendCompletedHandoffBinding(root, changeId, testExecute.input, { agentId: 'test-design-executor' });
  appendCompletedHandoffBinding(root, changeId, testCheck.input, { agentId: 'test-design-reviewer' });

  writeJson(path.join(root, designProofRef), buildCompoundDesignProof(root, architectureProof, testResult, testReview));
  assert.deepEqual(validateDesignStageGate(root, changeId), []);

  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), {
    ...architectureResult,
    inputDigests: { [requirementsRef]: 'b'.repeat(64) },
  });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /input digests do not match/u);
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), architectureResult);

  writeJson(v2ResultPath(root, changeId, testCheck.runId, 'check'), { ...testReview, rubricIds: ['security'] });
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /rubrics do not match/u);
  writeJson(v2ResultPath(root, changeId, testCheck.runId, 'check'), testReview);

  fs.appendFileSync(path.join(root, testCasesRef), '\nstale\n');
  assert.match(validateDesignStageGate(root, changeId).join('\n'), /stale|digest/u);

  console.log(`PASS design-stage-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
