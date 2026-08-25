import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildClarifyReadiness, CLARIFY_ITEMS } from '../lib/clarify-readiness.mjs';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-readiness-'));
const changeId = 'readiness-v2';
const changeDir = path.join(root, 'harness', 'changes', changeId);

try {
  fs.mkdirSync(changeDir, { recursive: true });
  const before = new Set(fs.readdirSync(changeDir));
  const readiness = buildClarifyReadiness(root, changeId);
  assert.equal(readiness.status, 'blocked');
  assert.deepEqual(readiness.items.map(({ id }) => id), CLARIFY_ITEMS);
  assert.equal(readiness.items.length, 15);
  assert.ok(readiness.items.every((item) => (
    CLARIFY_ITEMS.includes(item.id)
      && ['pass', 'blocked', 'stale', 'not-applicable'].includes(item.status)
      && Array.isArray(item.evidenceRefs)
      && typeof item.code === 'string'
      && typeof item.action === 'string'
  )));
  assert.deepEqual(readiness.recovery, {
    code: 'EH-CLARIFY-RESEARCH-131',
    action: 'Complete and persist every required ResearchPacket.',
  });
  assert.deepEqual(new Set(fs.readdirSync(changeDir)), before, 'readiness must not persist an editable checklist');
  assert.equal(Object.isFrozen(readiness), true);
  assert.equal(Object.isFrozen(readiness.items), true);
  assert.throws(() => buildClarifyReadiness(root, '../escape'), /EH-PATH-001/u);

  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`);
  const workflow = path.resolve(import.meta.dirname, '..', 'workflow.mjs');
  const jsonStatus = spawnSync(process.execPath, [workflow, 'status', changeId, '--json'], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(jsonStatus.status, 0, jsonStatus.stderr);
  const projection = JSON.parse(jsonStatus.stdout);
  assert.equal(projection.clarifyReadiness.items.length, 15);
  assert.deepEqual(projection.clarifyReadiness.recovery, readiness.recovery);
  const textStatus = spawnSync(process.execPath, [workflow, 'status', changeId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(textStatus.status, 0, textStatus.stderr);
  assert.match(textStatus.stdout, /clarifyReadiness: 1\/15 passed/u);
  assert.equal((textStatus.stdout.match(/recovery:/gu) || []).length, 1);
  assert.match(textStatus.stdout, /EH-CLARIFY-RESEARCH-131/u);

  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  fs.writeFileSync(path.join(root, requirementsRef), '# Requirements\n');
  const tecpc = {
    target: 'Clarify requirements',
    evidence: [requirementsRef],
    context: [requirementsRef],
    path: requirementsRef,
    correction: null,
  };
  const execute = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.confirmed',
    agent: { type: 'enterprise-harness:main', skill: 'harness' },
    inputRefs: [requirementsRef],
    tecpc,
  });
  fs.writeFileSync(v2ResultPath(root, changeId, execute.runId), `${JSON.stringify({
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId: execute.runId,
    producer: { agentType: 'enterprise-harness:main', skill: 'harness' },
    inputDigests: { ...execute.input.inputDigests },
    artifacts: [{ path: requirementsRef, digest: sha256Artifact(root, requirementsRef) }],
    assertions: [{ id: 'requirements', verdict: 'pass', evidence: [requirementsRef] }],
    selfCheck: { verdict: 'pass', findings: [], evidence: [requirementsRef] },
    tecpc,
    status: 'pass',
    needsDecision: null,
    completedAt: '2026-08-25T00:00:00.000Z',
  }, null, 2)}\n`);
  fs.appendFileSync(path.join(root, requirementsRef), 'stale\n');
  const staleReadiness = buildClarifyReadiness(root, changeId);
  assert.equal(
    staleReadiness.items.find(({ id }) => id === 'self-check-passed').status,
    'stale',
    'a stale StageResult artifact must invalidate the projected self-check',
  );

  const untrustedChangeId = 'readiness-untrusted-research';
  const untrustedDir = path.join(root, 'harness', 'changes', untrustedChangeId);
  const briefRef = `harness/changes/${untrustedChangeId}/evidence/code-brief.md`;
  fs.mkdirSync(path.dirname(path.join(root, briefRef)), { recursive: true });
  fs.writeFileSync(path.join(root, briefRef), '# Code brief\n');
  const researchRun = createHandoffV2(root, {
    changeId: untrustedChangeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [briefRef],
    tecpc: {
      target: 'Code facts', evidence: [briefRef], context: [briefRef], path: briefRef, correction: null,
    },
  });
  persistHandoffV2Result(root, untrustedChangeId, researchRun.runId, {
    packetVersion: 1,
    type: 'research-packet',
    changeId: untrustedChangeId,
    source: 'code-explore',
    question: 'Which code is affected?',
    scope: ['src'],
    facts: [{ claim: 'One component is affected.', sources: [briefRef] }],
    uncertainties: [],
    authority: 'codegraph-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [...researchRun.input.inputRefs],
    inputDigests: { ...researchRun.input.inputDigests },
    collectedAt: '2026-08-25T00:00:00.000Z',
  });
  const packetRef = path.relative(root, v2ResultPath(root, untrustedChangeId, researchRun.runId)).split(path.sep).join('/');
  fs.mkdirSync(untrustedDir, { recursive: true });
  fs.writeFileSync(path.join(untrustedDir, 'requirements.md'), [
    '# Requirements',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    `| code | yes | ${briefRef} | ${researchRun.runId} | ${packetRef} | complete | codegraph-first |`,
    '| docs | no | none | none | none | not-required | No external dependency. |',
    '- remaining fact uncertainty: none',
    '',
  ].join('\n'));
  const untrustedReadiness = buildClarifyReadiness(root, untrustedChangeId);
  assert.equal(
    untrustedReadiness.items.find(({ id }) => id === 'required-research-fresh').status,
    'blocked',
    'a ResearchPacket without trusted completed agent binding must not satisfy readiness',
  );

  console.log(`PASS clarify-readiness ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
