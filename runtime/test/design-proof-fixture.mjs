// Small, real v6 Design chain for downstream fixtures.  It intentionally
// writes handoffs, trusted agent bindings, execute/check results, the sealed
// ArchitectureProof and the compound DesignProof rather than hand-writing a
// shallow JSON lookalike.
import fs from 'node:fs';
import path from 'node:path';
import { buildCompoundDesignProof, buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function stageResult(root, changeId, input, producer, artifactRef, completedAt) {
  return {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: input.runId,
    producer,
    inputDigests: { ...input.inputDigests },
    artifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    assertions: [{ id: `${producer.skill}-contract`, verdict: 'pass', evidence: [artifactRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [artifactRef] },
    tecpc: { ...input.tecpc },
    status: 'pass',
    needsDecision: null,
    completedAt,
  };
}

function reviewResult(root, changeId, input, parent, artifactRef, reviewedAt) {
  return {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: input.runId,
    parentRunId: parent.runId,
    reviewer: { agentType: input.agent.type, skill: input.agent.skill },
    reviewedRunId: parent.runId,
    reviewedArtifacts: [{ path: artifactRef, digest: sha256Artifact(root, artifactRef) }],
    rubricIds: [...input.rubricIds],
    tecpc: { ...input.tecpc },
    verdict: 'pass',
    correction: null,
    reviewedAt,
  };
}

export function writeCanonicalCompoundDesignFixture(root, changeId, {
  stateStage = 'plan',
} = {}) {
  const base = `harness/changes/${changeId}`;
  const changeDir = path.join(root, base);
  const requirementsRef = `${base}/requirements.md`;
  const designRef = `${base}/design.md`;
  const testCasesRef = `${base}/test-cases.md`;
  const architectureProofRef = `${base}/evidence/completion/design-architecture.json`;
  const designProofRef = `${base}/evidence/completion/design.json`;
  fs.mkdirSync(changeDir, { recursive: true });
  if (!fs.existsSync(path.join(root, requirementsRef))) fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n');
  if (!fs.existsSync(path.join(root, designRef))) fs.writeFileSync(path.join(root, designRef), '# Design\n');
  if (!fs.existsSync(path.join(root, testCasesRef))) {
    fs.writeFileSync(path.join(root, testCasesRef), [
      '## 测试用例',
      '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
    ].join('\n'));
  }
  const classification = writeClassificationV2Fixture(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
  });
  writeJson(path.join(changeDir, 'state.json'), {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: stateStage,
    artifacts: { classification },
    validation: { status: 'missing', digest: null, validatedAt: null },
  });

  const architectureTecpc = {
    target: 'produce architecture design', evidence: [designRef], context: [requirementsRef], path: `${requirementsRef} -> ${designRef}`, correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' }, inputRefs: [requirementsRef], tecpc: architectureTecpc,
  });
  const architectureResult = stageResult(root, changeId, architectureExecute.input,
    { agentType: 'enterprise-harness:artifact-worker', skill: 'design' }, designRef, '2026-08-29T00:00:00.000Z');
  writeJson(v2ResultPath(root, changeId, architectureExecute.runId), architectureResult);
  const architectureCheck = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.review', role: 'check', parentRunId: architectureExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: [designRef], tecpc: architectureTecpc,
  });
  const architectureReview = reviewResult(root, changeId, architectureCheck.input, architectureExecute.input, designRef, '2026-08-29T00:00:01.000Z');
  writeJson(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), architectureReview);
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'fixture-architecture-executor' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'fixture-architecture-reviewer' });
  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  writeJson(path.join(root, architectureProofRef), architectureProof);

  const testDesignTecpc = {
    target: 'produce test cases', evidence: [testCasesRef], context: [requirementsRef, designRef, architectureProofRef], path: `${architectureProofRef} -> ${testCasesRef}`, correction: null,
  };
  const testDesignExecute = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, designRef, architectureProofRef], tecpc: testDesignTecpc,
  });
  const testDesignResult = stageResult(root, changeId, testDesignExecute.input,
    { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' }, testCasesRef, '2026-08-29T00:00:02.000Z');
  writeJson(v2ResultPath(root, changeId, testDesignExecute.runId), testDesignResult);
  const testDesignCheck = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.test-cases.review', role: 'check', parentRunId: testDesignExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: [testCasesRef], tecpc: testDesignTecpc,
  });
  const testDesignReview = reviewResult(root, changeId, testDesignCheck.input, testDesignExecute.input, testCasesRef, '2026-08-29T00:00:03.000Z');
  writeJson(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), testDesignReview);
  appendCompletedHandoffBinding(root, changeId, testDesignExecute.input, { agentId: 'fixture-test-design-executor' });
  appendCompletedHandoffBinding(root, changeId, testDesignCheck.input, { agentId: 'fixture-test-design-reviewer' });
  const designProof = buildCompoundDesignProof(root, architectureProof, testDesignResult, testDesignReview);
  writeJson(path.join(root, designProofRef), designProof);
  return { requirementsRef, designRef, testCasesRef, architectureProofRef, designProofRef, designProof, testDesignExecute, testDesignCheck };
}
