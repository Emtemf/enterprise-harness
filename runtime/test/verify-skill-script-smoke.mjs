import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { verifyCommandEvidenceRef, verifyCommandOutputRef } from '../api/verify-command.mjs';
import { writeCanonicalCompoundDesignFixture } from './design-proof-fixture.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'verify', 'scripts', 'finalize-result.mjs');
const prepare = path.join(sourceRoot, 'skills', 'verify', 'scripts', 'prepare-input.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-verify-skill-'));
const changeId = 'verify-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const validationRef = `harness/changes/${changeId}/validation.md`;
const testCasesRef = `harness/changes/${changeId}/test-cases.md`;
const designProofRef = `harness/changes/${changeId}/evidence/completion/design.json`;

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, testCasesRef), [
    '## 测试用例',
    '| TCID | Traces | Level | Priority | Preconditions | Data | Actions | Observable assertions | Cleanup/Recovery | Status |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| TC1 | R1 / D1 / VO1 | unit | normal | setup | input | run | observable result | cleanup | accepted |',
  ].join('\n'));
  // Adversarial RED: a coverage line is not a receipt.  A non-empty arbitrary
  // string must never be accepted as execution evidence.
  fs.writeFileSync(path.join(root, validationRef), [
    '# Validation',
    '## Commands',
    '- node --test',
    '## Results',
    '- pass',
    '## Freshness',
    '- current input digest',
    '## Coverage and exceptions',
    '- TC1 | executed | arbitrary-proof-string',
  ].join('\n'));
  writeCanonicalCompoundDesignFixture(root, changeId, { stateStage: 'verify' });
  const tasksRef = `harness/changes/${changeId}/tasks.md`;
  const taskCommandsRef = `harness/changes/${changeId}/task-commands.json`;
  const planProofRef = `harness/changes/${changeId}/evidence/completion/plan.json`;
  const implementProofRef = `harness/changes/${changeId}/evidence/completion/implement.json`;
  fs.writeFileSync(path.join(root, tasksRef), '# Tasks\n\n## Task 1: task-one\n\n- Test cases: TC1\n- Strategy: `direct`\n- Minimal RED case: none\n');
  fs.writeFileSync(path.join(root, taskCommandsRef), `${JSON.stringify({ schemaVersion: 4, tasks: {
    'task-one': { executionStrategy: 'direct', strategyRationale: 'fixture', testCases: ['TC1'], minimalRedCase: null, writeScope: { allowed: ['fixture.txt'], forbidden: [] }, commands: [{ phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'] }] },
  } }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(path.join(root, planProofRef)), { recursive: true });
  fs.writeFileSync(path.join(root, planProofRef), '{"type":"completion-proof","stage":"plan"}\n');
  fs.writeFileSync(path.join(root, implementProofRef), '{"type":"completion-proof","stage":"implement"}\n');
  const verifyInputs = [testCasesRef, designProofRef, tasksRef, taskCommandsRef, planProofRef, implementProofRef];
  const bogusHandoff = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: [validationRef, ...verifyInputs],
    tecpc: { target: 'verify slice', evidence: [validationRef], context: [validationRef, testCasesRef, designProofRef], path: validationRef, correction: null },
  });
  const bogus = spawnSync(process.execPath, [finalize, changeId, bogusHandoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(bogus.status, 0, 'Verify must reject an arbitrary receipt string');
  assert.match(bogus.stderr, /receipt|evidence|provenance/u);

  const evidenceRef = `harness/changes/${changeId}/evidence/verify-placeholder/TC1.log`;
  fs.mkdirSync(path.dirname(path.join(root, evidenceRef)), { recursive: true });
  fs.writeFileSync(path.join(root, evidenceRef), 'verified evidence\n');
  fs.writeFileSync(path.join(root, validationRef), [
    '# Validation',
    '## Commands',
    '- node --test',
    '## Results',
    '- pass',
    '## Freshness',
    '- current input digest',
    '## Coverage and exceptions',
    `- TC1 | executed | ${evidenceRef}`,
  ].join('\n'));
  const handoff = createHandoffV2(root, {
    changeId,
    stage: 'verify',
    behavior: 'verify.collect',
    agent: { type: 'enterprise-harness:artifact-worker', skill: 'verify' },
    inputRefs: verifyInputs,
    tecpc: { target: 'verify slice', evidence: [testCasesRef], context: [testCasesRef, designProofRef], path: validationRef, correction: null },
  });
  const correctEvidenceRef = verifyCommandEvidenceRef(changeId, handoff.runId, 'TC1');
  const stdoutRef = verifyCommandOutputRef(changeId, handoff.runId, 'TC1', 1, 'stdout');
  const stderrRef = verifyCommandOutputRef(changeId, handoff.runId, 'TC1', 1, 'stderr');
  fs.mkdirSync(path.dirname(path.join(root, correctEvidenceRef)), { recursive: true });
  fs.writeFileSync(path.join(root, stdoutRef), 'verified evidence\n');
  fs.writeFileSync(path.join(root, stderrRef), '');
  fs.writeFileSync(path.join(root, correctEvidenceRef), `${JSON.stringify({
    evidenceVersion: 1, type: 'verification-command-evidence', changeId, verifyRunId: handoff.runId, tcId: 'TC1',
    agent: { id: 'fixture-verifier', type: 'enterprise-harness:artifact-worker', skill: 'verify' }, inputDigests: { ...handoff.input.inputDigests },
    executions: [{ taskId: 'task-one', phase: 'VERIFY', argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'exit', exitCode: 0, signal: null, spawnError: null, startedAt: '2026-09-04T00:00:00.000Z', finishedAt: '2026-09-04T00:00:01.000Z', stdoutDigest: sha256Artifact(root, stdoutRef), stderrDigest: sha256Artifact(root, stderrRef), stdoutRef, stderrRef }],
    status: 'pass', completedAt: '2026-09-04T00:00:01.000Z',
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, validationRef), [
    '# Validation',
    '## Commands',
    '- node --test',
    '## Results',
    '- pass',
    '## Freshness',
    '- current input digest',
    '## Coverage and exceptions',
    `- TC1 | executed | ${correctEvidenceRef}`,
  ].join('\n'));
  const prepared = spawnSync(process.execPath, [prepare, `HANDOFF_INPUT=${handoff.path}`], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(prepared.status, 0, prepared.stderr);
  const passed = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(passed.status, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).status, 'pass');
  assert.ok(fs.existsSync(v2ResultPath(root, changeId, handoff.runId)), 'Verify finalizer must atomically persist its StageResult');

  fs.writeFileSync(path.join(root, validationRef), '# Validation\n## Commands\n');
  const rejected = spawnSync(process.execPath, [finalize, changeId, handoff.runId], { cwd: root, encoding: 'utf-8', shell: false });
  assert.notEqual(rejected.status, 0, 'incomplete validation must not finalize');

  console.log(`PASS verify-skill-script ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
