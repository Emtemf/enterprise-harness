import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHandoffV2 } from '../core/handoff-v2.mjs';
import {
  persistVerificationReceipts,
  validateVerificationReceipt,
  validateVerificationReceiptsForStageResult,
  verificationReceiptRef,
} from '../api/verification-receipt.mjs';
import { readVerifyCommandEvidence, verifyCommandEvidenceRef, verifyCommandOutputRef } from '../api/verify-command.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verification-receipt-'));
const changeId = 'verification-receipt';
const base = `harness/changes/${changeId}`;
const validationRef = `${base}/validation.md`;

function expectThrow(action, pattern, label) {
  assert.throws(action, pattern, label);
}

try {
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: root, shell: false }).status, 0);
  fs.mkdirSync(path.join(root, base), { recursive: true });
  fs.writeFileSync(path.join(root, `${base}/test-cases.md`), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable | cleanup | accepted |',
  ].join('\n'));
  const design = writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  const tasksRef = `${base}/tasks.md`;
  const commandsRef = `${base}/task-commands.json`;
  const planProofRef = `${base}/evidence/completion/plan.json`;
  const implementProofRef = `${base}/evidence/completion/implement.json`;
  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task 1: task-one\n\n- Test cases: TC1\n- Strategy: `direct`\n- Minimal RED case: none\n');
  fs.writeFileSync(path.join(root, commandsRef), `${JSON.stringify({
    schemaVersion: 4,
    tasks: { 'task-one': { executionStrategy: 'direct', strategyRationale: 'fixture', testCases: ['TC1'], minimalRedCase: null, writeScope: { allowed: ['fixture.txt'], forbidden: [] }, commands: [{ phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'] }] } },
  }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(path.join(root, planProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, planProofRef), '{"type":"completion-proof","stage":"plan"}\n');
  fs.writeFileSync(path.join(root, implementProofRef), '{"type":"completion-proof","stage":"implement"}\n');
  fs.writeFileSync(path.join(root, validationRef), '# Validation\n\n## Commands\n- test\n\n## Results\n- pass\n\n## Freshness\n- fresh\n\n## Coverage and exceptions\n');
  const handoff = createHandoffV2(root, {
    changeId, stage: 'verify', behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: [design.testCasesRef, design.designProofRef, tasksRef, commandsRef, planProofRef, implementProofRef],
    tecpc: { target: 'receipt contract', evidence: [validationRef], context: [design.testCasesRef, design.designProofRef], path: validationRef, correction: null },
  });
  const canonicalEvidenceRef = verifyCommandEvidenceRef(changeId, handoff.runId, 'TC1');

  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef: canonicalEvidenceRef, reason: null }],
  }), /unreadable|missing/u, 'nonexistent evidence must fail closed');
  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef: '../escape.log', reason: null }],
  }), /safe|canonical/u, 'path escape must fail closed');
  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'skipped', evidenceRef: validationRef, reason: null }],
  }), /requires a non-empty reason/u, 'skipped TC status must preserve an explicit reason');
  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'unsupported', evidenceRef: validationRef, reason: 'unsupported fixture' }],
  }), /unsupported.*cannot pass/u, 'unsupported TC status must never produce a passing Verify receipt set');

  const outside = path.join(root, 'outside.log');
  fs.writeFileSync(outside, 'outside\n');
  const symlinkRef = canonicalEvidenceRef;
  fs.mkdirSync(path.dirname(path.join(root, symlinkRef)), { recursive: true });
  fs.symlinkSync(outside, path.join(root, symlinkRef));
  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef: symlinkRef, reason: null }],
  }), /symbolic-link|unreadable/u, 'symlink evidence must fail closed');
  fs.rmSync(path.join(root, symlinkRef));

  const evidenceRef = canonicalEvidenceRef;
  const stdoutRef = verifyCommandOutputRef(changeId, handoff.runId, 'TC1', 1, 'stdout');
  const stderrRef = verifyCommandOutputRef(changeId, handoff.runId, 'TC1', 1, 'stderr');
  fs.writeFileSync(path.join(root, stdoutRef), 'trusted verify output\n');
  fs.writeFileSync(path.join(root, stderrRef), '');
  fs.rmSync(path.join(root, stdoutRef));
  fs.symlinkSync(outside, path.join(root, stdoutRef));
  fs.writeFileSync(path.join(root, evidenceRef), `${JSON.stringify({
    evidenceVersion: 1, type: 'verification-command-evidence', changeId, verifyRunId: handoff.runId, tcId: 'TC1',
    agent: { id: 'fixture-verifier', type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputDigests: { ...handoff.input.inputDigests },
    executions: [{ taskId: 'task-one', phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'exit', exitCode: 0, signal: null, spawnError: null, startedAt: '2026-09-04T00:00:00.000Z', finishedAt: '2026-09-04T00:00:01.000Z', stdoutDigest: sha256Artifact(root, stdoutRef), stderrDigest: sha256Artifact(root, stderrRef), stdoutRef, stderrRef }],
    status: 'pass', completedAt: '2026-09-04T00:00:01.000Z',
  }, null, 2)}\n`);
  assert.match(readVerifyCommandEvidence(root, changeId, handoff.runId, 'TC1').problems.join('\n'), /symbolic-link/u,
    'command output symlinks must fail closed even when their digest matches');
  fs.rmSync(path.join(root, evidenceRef));
  fs.rmSync(path.join(root, stdoutRef));
  fs.writeFileSync(path.join(root, stdoutRef), 'trusted verify output\n');
  fs.writeFileSync(path.join(root, evidenceRef), `${JSON.stringify({
    evidenceVersion: 1, type: 'verification-command-evidence', changeId, verifyRunId: handoff.runId, tcId: 'TC1',
    agent: { id: 'fixture-verifier', type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputDigests: { ...handoff.input.inputDigests },
    executions: [{ taskId: 'task-one', phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'exit', exitCode: 0, signal: null, spawnError: null, startedAt: '2026-09-04T00:00:00.000Z', finishedAt: '2026-09-04T00:00:01.000Z', stdoutDigest: sha256Artifact(root, stdoutRef), stderrDigest: sha256Artifact(root, stderrRef), stdoutRef, stderrRef }],
    status: 'pass', completedAt: '2026-09-04T00:00:01.000Z',
  }, null, 2)}\n`);
  const persisted = persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef, reason: null }],
  });
  assert.equal(persisted.receipts.length, 1);
  const receiptPath = verificationReceiptRef(changeId, handoff.runId, 'TC1');
  const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptPath), 'utf-8'));
  assert.equal(receipt.provenance, 'verify-command');
  assert.deepEqual(validateVerificationReceipt(root, receipt, {
    expectedChangeId: changeId, expectedVerifyRunId: handoff.runId, expectedTcId: 'TC1',
    expectedInputDigests: handoff.input.inputDigests, expectedValidation: receipt.validation,
  }), []);
  const rogueReceiptRef = `${base}/evidence/verification/${handoff.runId}/rogue/TC1.json`;
  fs.mkdirSync(path.dirname(path.join(root, rogueReceiptRef)), { recursive: true });
  fs.copyFileSync(path.join(root, receiptPath), path.join(root, rogueReceiptRef));
  assert.match(validateVerificationReceiptsForStageResult(root, {
    changeId,
    verifyRunId: handoff.runId,
    inputDigests: handoff.input.inputDigests,
    artifacts: [
      { path: validationRef, digest: sha256Artifact(root, validationRef) },
      { path: rogueReceiptRef, digest: sha256Artifact(root, rogueReceiptRef) },
    ],
  }).join('\n'), /canonical verification receipt artifact path/u,
  'a byte-identical receipt under a rogue subdirectory must not stand in for its canonical receipt ref');
  expectThrow(() => persistVerificationReceipts(root, {
    changeId, verifyRunId: handoff.runId, inputDigests: handoff.input.inputDigests, validationRef,
    coverage: [{ tcId: 'TC1', status: 'executed', evidenceRef, reason: null }],
  }), /already exists/u, 'verification receipts must be immutable and reject duplicates');
  assert.match(validateVerificationReceipt(root, { ...receipt, verifyRunId: 'run_11111111-1111-4111-8111-111111111111' }, {
    expectedChangeId: changeId, expectedVerifyRunId: handoff.runId, expectedTcId: 'TC1',
    expectedInputDigests: handoff.input.inputDigests, expectedValidation: receipt.validation,
  }).join('\n'), /verifyRunId must be|canonical verify\.collect/u, 'wrong run must fail closed');
  const externalReceipt = path.join(root, 'external-receipt.json');
  fs.copyFileSync(path.join(root, receiptPath), externalReceipt);
  fs.rmSync(path.join(root, receiptPath));
  fs.symlinkSync(externalReceipt, path.join(root, receiptPath));
  assert.match(validateVerificationReceiptsForStageResult(root, {
    changeId,
    verifyRunId: handoff.runId,
    inputDigests: handoff.input.inputDigests,
    artifacts: [
      { path: validationRef, digest: sha256Artifact(root, validationRef) },
      { path: receiptPath, digest: sha256Artifact(root, receiptPath) },
    ],
  }).join('\n'), /symbolic-link/u, 'StageResult receipt validation must reject a symlinked receipt artifact');
  fs.appendFileSync(path.join(root, evidenceRef), 'mutated\n');
  assert.match(validateVerificationReceipt(root, receipt, {
    expectedChangeId: changeId, expectedVerifyRunId: handoff.runId, expectedTcId: 'TC1',
    expectedInputDigests: handoff.input.inputDigests, expectedValidation: receipt.validation,
  }).join('\n'), /evidence digest is stale/u, 'stale evidence must fail closed');
  console.log(`PASS verification-receipt-contract ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
