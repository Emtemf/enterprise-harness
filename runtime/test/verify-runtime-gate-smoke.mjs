import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffV2, persistHandoffV2Result } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { validateStageGate } from '../lib/stage-results.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';
import { writeCanonicalVerifyCompletionFixture } from './verify-completion-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-runtime-gate-'));

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function writeForgedVerifyChain(changeId, inputRefs) {
  const base = `harness/changes/${changeId}`;
  const validationRef = `${base}/validation.md`;
  fs.mkdirSync(path.join(root, base), { recursive: true });
  fs.writeFileSync(path.join(root, validationRef), '# Validation\n\n## Commands\n- test\n\n## Results\n- pass\n\n## Freshness\n- fresh\n\n## Coverage and exceptions\n- none\n');
  const tecpc = { target: 'forged verify', evidence: [validationRef], context: inputRefs, path: validationRef, correction: null };
  const execute = createHandoffV2(root, {
    changeId, stage: 'verify', behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' }, inputRefs, tecpc,
  });
  const result = {
    resultVersion: 1, type: 'stage-result', changeId, stage: 'verify', runId: execute.runId,
    producer: { agentType: 'enterprise-harness:artifact-worker', skill: 'verify' }, inputDigests: { ...execute.input.inputDigests },
    artifacts: [{ path: validationRef, digest: sha256Artifact(root, validationRef) }],
    assertions: [{ id: 'forged', verdict: 'pass', evidence: [validationRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [validationRef] }, tecpc, status: 'pass', needsDecision: null,
    completedAt: '2026-08-29T00:00:00.000Z',
  };
  persistHandoffV2Result(root, changeId, execute.runId, result);
  appendCompletedHandoffBinding(root, changeId, execute.input, { agentId: `${changeId}-executor` });
  const check = createHandoffV2(root, {
    changeId, stage: 'verify', behavior: 'review', role: 'check', parentRunId: execute.runId,
    agent: { type: 'enterprise-harness:reviewer', skill: 'review' }, inputRefs: [validationRef], tecpc,
  });
  const review = {
    resultVersion: 1, type: 'review-result', changeId, stage: 'verify', runId: check.runId, parentRunId: execute.runId,
    reviewer: { agentType: 'enterprise-harness:reviewer', skill: 'review' }, reviewedRunId: execute.runId,
    reviewedArtifacts: result.artifacts, rubricIds: [...check.input.rubricIds], tecpc, verdict: 'pass', correction: null,
    reviewedAt: '2026-08-29T00:00:01.000Z',
  };
  persistHandoffV2Result(root, changeId, check.runId, review);
  appendCompletedHandoffBinding(root, changeId, check.input, { agentId: `${changeId}-reviewer` });
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  writeForgedVerifyChain('verify-bypass-inputs', []);
  const missingInputs = validateStageGate(root, 'verify-bypass-inputs', 'verify').join('\n');
  assert.match(missingInputs, /verify input must digest-bind test-cases\.md/u);
  assert.match(missingInputs, /verify input must digest-bind compound DesignProof/u);

  const changeId = 'verify-bypass-receipt';
  const base = `harness/changes/${changeId}`;
  fs.mkdirSync(path.join(root, base), { recursive: true });
  fs.writeFileSync(path.join(root, `${base}/test-cases.md`), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  const design = writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  writeForgedVerifyChain(changeId, [design.testCasesRef, design.designProofRef]);
  const missingReceipts = validateStageGate(root, changeId, 'verify').join('\n');
  assert.match(missingReceipts, /TC1 has no canonical verification receipt/u, 'a direct durable Verify StageResult cannot bypass receipt validation');

  const freshChange = 'verify-freshness';
  const freshBase = `harness/changes/${freshChange}`;
  fs.mkdirSync(path.join(root, freshBase), { recursive: true });
  fs.writeFileSync(path.join(root, `${freshBase}/test-cases.md`), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  writeCanonicalCompoundDesignFixture(root, freshChange, { stateStage: 'verify' });
  writeCanonicalVerifyCompletionFixture(root, freshChange);
  assert.deepEqual(validateStageGate(root, freshChange, 'verify'), []);
  fs.appendFileSync(path.join(root, `${freshBase}/test-cases.md`), '\nmutated after Verify\n');
  assert.match(validateStageGate(root, freshChange, 'verify').join('\n'), /stale.*test-cases\.md|test-cases\.md.*stale/u);
  console.log(`PASS verify-runtime-gate ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
