import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-proof-cli-'));
const changeId = 'architecture-proof-cli';
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const designRef = `harness/changes/${changeId}/design.md`;
const proofRef = `harness/changes/${changeId}/evidence/completion/design-architecture.json`;

function run(...args) {
  return spawnSync(process.execPath, [cli, 'design', ...args], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
}

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n');
  fs.writeFileSync(path.join(root, designRef), '# Design\n');
  const tecpc = {
    target: 'seal architecture', evidence: [designRef], context: [requirementsRef],
    path: `${requirementsRef} -> ${designRef}`, correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.produce',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'design' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  const stageResult = {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'design', runId: execute.runId,
    producer: { agentType: execute.input.agent.type, skill: execute.input.agent.skill },
    inputDigests: { ...execute.input.inputDigests },
    artifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    assertions: [{ id: 'architecture-shape', verdict: 'pass', evidence: [designRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [designRef] },
    tecpc, status: 'pass', needsDecision: null, completedAt: '2026-08-28T00:00:00.000Z',
  };
  writeJson(v2ResultPath(root, changeId, execute.runId), stageResult);
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: 'architecture-cli-executor' });

  const missingReview = run('seal-architecture', changeId);
  assert.equal(missingReview.status, 2, missingReview.stderr || missingReview.stdout);
  assert.match(missingReview.stderr, /EH-DESIGN-PROOF-001/u);

  const check = createHandoffV2(root, {
    changeId,
    stage: 'design',
    behavior: 'design.review',
    role: 'check',
    parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' },
    inputRefs: [designRef],
    tecpc,
  });
  const review = {
    resultVersion: 1, type: 'review-result', changeId, stage: 'design', runId: check.runId,
    parentRunId: execute.runId, reviewer: { agentType: check.input.agent.type, skill: check.input.agent.skill },
    reviewedRunId: execute.runId,
    reviewedArtifacts: [{ path: designRef, digest: sha256Artifact(root, designRef) }],
    rubricIds: [...check.input.rubricIds], tecpc, verdict: 'pass', correction: null,
    reviewedAt: '2026-08-28T00:00:01.000Z',
  };
  writeJson(v2ResultPath(root, changeId, check.runId, 'check'), review);
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: 'architecture-cli-reviewer' });

  const sealed = run('seal-architecture', changeId);
  assert.equal(sealed.status, 0, sealed.stderr);
  const proofPath = path.join(root, proofRef);
  const proof = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
  assert.equal(proof.type, 'design-architecture-proof');
  assert.equal(proof.executionRunId, execute.runId);
  assert.equal(proof.reviewRunId, check.runId);
  assert.equal(fs.readdirSync(path.dirname(proofPath)).some((name) => name.endsWith('.tmp')), false);

  const sealedAgain = run('seal-architecture', changeId);
  assert.equal(sealedAgain.status, 0, sealedAgain.stderr);
  assert.deepEqual(JSON.parse(sealedAgain.stdout), proof);

  writeJson(proofPath, {
    ...proof,
    executionRunId: 'run_ffffffff-ffff-4fff-8fff-ffffffffffff',
  });
  const conflicting = run('seal-architecture', changeId);
  assert.equal(conflicting.status, 2);
  assert.match(conflicting.stderr, /EH-DESIGN-PROOF-001/u);

  fs.writeFileSync(proofPath, '{malformed\n');
  const malformed = run('seal-architecture', changeId);
  assert.equal(malformed.status, 2);
  assert.match(malformed.stderr, /EH-DESIGN-PROOF-001/u);

  if (process.platform !== 'win32') {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-design-proof-outside-'));
    const completionDir = path.dirname(proofPath);
    fs.rmSync(completionDir, { recursive: true, force: true });
    fs.symlinkSync(outside, completionDir, 'dir');
    const symlinked = run('seal-architecture', changeId);
    assert.equal(symlinked.status, 2);
    assert.match(symlinked.stderr, /EH-PATH-001/u);
    assert.equal(fs.existsSync(path.join(outside, 'design-architecture.json')), false);
    fs.unlinkSync(completionDir);
    fs.rmSync(outside, { recursive: true, force: true });
  }

  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /design seal-architecture <change-id>/u);

  const injectionMarker = path.join(root, 'cli-shell-injection');
  const unsafe = run('seal-architecture', `unsafe;touch ${injectionMarker}`);
  assert.equal(unsafe.status, 2);
  assert.match(unsafe.stderr, /EH-PATH-001/u);
  assert.equal(fs.existsSync(injectionMarker), false, 'CLI arguments must never be evaluated by a shell');

  console.log(`PASS design-architecture-proof-cli ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
