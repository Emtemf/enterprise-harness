import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { approvedRequirements } from './clarify-readiness-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const finalize = path.join(sourceRoot, 'skills', 'review', 'scripts', 'finalize-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-review-finalize-'));
const changeId = 'review-finalize';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), approvedRequirements());
  const classification = writeClassificationV2Fixture(root, changeId);
  fs.writeFileSync(path.join(root, 'harness', 'changes', changeId, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'design',
    artifacts: { classification },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, designRef), '# Design\n\n## R1\n');
  const tecpc = { target: 'review design', evidence: [designRef], context: [requirementsRef], path: designRef, correction: null };
  const execute = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' }, inputRefs: [requirementsRef], tecpc,
  });
  const stageResult = {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'design', runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputDigests: { [requirementsRef]: sha256Artifact(root, requirementsRef) },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'artifact-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc, status: 'pass', needsDecision: null, completedAt: '2026-08-14T00:00:00.000Z',
  };
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), JSON.stringify(stageResult));
  const check = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.review', role: 'check', parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: [designRef], tecpc,
  });

  const pass = spawnSync(process.execPath, [finalize, changeId, check.runId, 'pass'], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(pass.status, 0, pass.stderr || pass.stdout);
  const review = JSON.parse(pass.stdout);
  assert.equal(review.verdict, 'pass');
  assert.deepEqual(review.rubricIds, ['design']);
  assert.equal(review.correction, null);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, check.runId, 'check'), 'utf-8')),
    review,
    'review finalizer must persist its own immutable ReviewResult',
  );

  const duplicate = spawnSync(process.execPath, [finalize, changeId, check.runId, 'pass'], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(duplicate.status, 2);
  assert.match(duplicate.stderr, /durable result already exists/u);

  const incompleteCheck = createHandoffV2(root, {
    changeId, stage: 'design', behavior: 'design.review', role: 'check', parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: [designRef], tecpc,
  });
  const incomplete = spawnSync(process.execPath, [finalize, changeId, incompleteCheck.runId, 'block'], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(incomplete.status, 2);
  assert.match(incomplete.stderr, /requires a correction/u);

  console.log(`PASS review-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
