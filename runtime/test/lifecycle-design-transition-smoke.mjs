import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDesignArchitectureProof } from '../core/design-proof.mjs';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const lifecycle = path.join(sourceRoot, 'runtime', 'lifecycle.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-lifecycle-design-gate-'));
const changeId = 'design-transition';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const architectureProofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;
let classificationReference;
const {
  ENTERPRISE_HARNESS_SESSION_ID: _enterpriseHarnessSessionId,
  CLAUDE_SESSION_ID: _claudeSessionId,
  ...unboundEnv
} = process.env;

function state() {
  return {
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification: classificationReference },
    validation: { status: 'stale', digest: null, validatedAt: null },
  };
}

function advance() {
  return spawnSync(process.execPath, [lifecycle, 'state', changeId, 'plan'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(changeDir, { recursive: true });
  classificationReference = writeClassificationArtifact(root, changeId, {
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no', security: 'no' },
    decision: { tier: 'L1' },
  });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n\n## R1\n- Design transition\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  fs.writeFileSync(path.join(root, testCasesRef), '# Test Cases\n\n## TC1\n');
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify(state(), null, 2)}\n`);

  const directArchive = spawnSync(process.execPath, [lifecycle, 'state', changeId, 'archive'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    env: unboundEnv,
  });
  assert.equal(directArchive.status, 2, directArchive.stderr || directArchive.stdout);
  assert.match(`${directArchive.stdout}\n${directArchive.stderr}`, /必须通过 archive 命令/u);

  const blocked = advance();
  assert.equal(blocked.status, 2, blocked.stderr || blocked.stdout);
  assert.match(`${blocked.stdout}\n${blocked.stderr}`, /fresh StageResult/u);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'design');

  const architectureTecpc = {
    target: 'produce architecture design',
    evidence: [designRef],
    context: [requirementsRef],
    path: designRef,
    correction: null,
  };
  const architectureExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc: architectureTecpc,
  });
  const architectureResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: architectureExecute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { ...architectureExecute.input.inputDigests },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc: architectureTecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, architectureExecute.runId), JSON.stringify(architectureResult));

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
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: architectureCheck.runId,
    parentRunId: architectureExecute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: architectureExecute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: [...architectureCheck.input.rubricIds],
    tecpc: architectureTecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:01.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, architectureCheck.runId, 'check'), JSON.stringify(architectureReview));
  appendCompletedHandoffBinding(root, changeId, architectureExecute.input, { agentId: 'agent-design' });
  appendCompletedHandoffBinding(root, changeId, architectureCheck.input, { agentId: 'agent-design-review' });

  const architectureProof = buildDesignArchitectureProof(root, architectureResult, architectureReview);
  fs.mkdirSync(path.dirname(path.join(root, architectureProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, architectureProofRef), `${JSON.stringify(architectureProof, null, 2)}\n`);

  const architectureOnly = advance();
  assert.equal(architectureOnly.status, 2, architectureOnly.stderr || architectureOnly.stdout);
  assert.match(`${architectureOnly.stdout}\n${architectureOnly.stderr}`, /test-design StageResult is missing/u);
  assert.equal(fs.existsSync(path.join(root, designProofRef)), false, 'architecture-only lifecycle must not publish Design proof');

  const testDesignTecpc = {
    target: 'produce detailed test cases',
    evidence: [testCasesRef],
    context: [requirementsRef, designRef, architectureProofRef],
    path: `${architectureProofRef} -> ${testCasesRef}`,
    correction: null,
  };
  const testDesignExecute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases',
    agent: { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputRefs: [requirementsRef, designRef, architectureProofRef],
    tecpc: testDesignTecpc,
  });
  const testDesignResult = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'design',
    runId: testDesignExecute.runId,
    producer: { agentType: 'enterprise-harness:test-design-worker', skill: 'test-design' },
    inputDigests: { ...testDesignExecute.input.inputDigests },
    artifacts: [{ path: testCasesRef, digest: sha256Artifact(root, testCasesRef) }],
    assertions: [{ id: 'test-design-contract', verdict: 'pass', evidence: [testCasesRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [testCasesRef] },
    tecpc: testDesignTecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-14T00:00:02.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, testDesignExecute.runId), JSON.stringify(testDesignResult));
  const testDesignCheck = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.test-cases.review',
    role: 'check',
    parentRunId: testDesignExecute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [testCasesRef],
    tecpc: testDesignTecpc,
  });
  const testDesignReview = {
    resultVersion: 1,
    type: 'review-result',
    changeId,
    stage: 'design',
    runId: testDesignCheck.runId,
    parentRunId: testDesignExecute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' },
    reviewedRunId: testDesignExecute.runId,
    reviewedArtifacts: [{ path: testCasesRef, digest: sha256Artifact(root, testCasesRef) }],
    rubricIds: [...testDesignCheck.input.rubricIds],
    tecpc: testDesignTecpc,
    verdict: 'pass',
    correction: null,
    reviewedAt: '2026-08-14T00:00:03.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, testDesignCheck.runId, 'check'), JSON.stringify(testDesignReview));
  appendCompletedHandoffBinding(root, changeId, testDesignExecute.input, { agentId: 'agent-test-design' });
  appendCompletedHandoffBinding(root, changeId, testDesignCheck.input, { agentId: 'agent-test-design-review' });

  const advanced = advance();
  assert.equal(advanced.status, 0, advanced.stderr || advanced.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'plan');
  const designProof = JSON.parse(fs.readFileSync(path.join(root, designProofRef), 'utf-8'));
  assert.deepEqual(designProof.stageProofs.map(({ kind }) => kind), ['architecture', 'test-design']);

  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({ ...state(), revision: 3 }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, designRef), '# Mutated design\n');
  const stale = advance();
  assert.equal(stale.status, 2, stale.stderr || stale.stdout);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /stale/u);

  console.log(`PASS lifecycle-design-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
