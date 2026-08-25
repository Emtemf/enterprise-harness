import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

  const tecpc = {
    target: 'design transition',
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
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
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
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: 'agent-design' });
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'agent-design-review' });

  const advanced = advance();
  assert.equal(advanced.status, 0, advanced.stderr || advanced.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8')).stage, 'plan');

  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({ ...state(), revision: 3 }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, designRef), '# Mutated design\n');
  const stale = advance();
  assert.equal(stale.status, 2, stale.stderr || stale.stdout);
  assert.match(`${stale.stdout}\n${stale.stderr}`, /stale/u);

  console.log(`PASS lifecycle-design-transition ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
