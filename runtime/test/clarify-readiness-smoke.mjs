import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildClarifyReadiness, CLARIFY_ITEMS } from '../lib/clarify-readiness.mjs';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { addClarifyCompletion, prepareClassifiedClarify } from './clarify-readiness-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { appendDecisionEvent, readDecisionEvents, sealClarifyDecisionSnapshot } from '../core/decision-ledger.mjs';
import { writeDebtAssessment, writeProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { pendingQuestionPath } from '../core/clarify-question.mjs';

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

  writeClassificationV2Fixture(root, changeId, { tier: 'L1' });
  const orphanClassification = buildClarifyReadiness(root, changeId);
  assert.equal(
    orphanClassification.items.find(({ id }) => id === 'classification-fresh').status,
    'blocked',
    'an orphan classification file is not authoritative when State v6 has no reference',
  );

  const staleStatusId = 'readiness-stale-status';
  const staleStatusDir = path.join(root, 'harness', 'changes', staleStatusId);
  fs.mkdirSync(staleStatusDir, { recursive: true });
  fs.writeFileSync(path.join(staleStatusDir, 'requirements.md'), [
    '# Requirements',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | No code research needed. |',
    '| docs | no | none | none | none | not-required | No docs research needed. |',
    '- remaining fact uncertainty: none',
    '## 组件拓扑',
    '| Component | Description | Status |',
    '|---|---|---|',
    '| runtime | Workflow runtime | active |',
    '- topology confirmed: true',
    '## Component × Dimension 评分',
    '| Component | Dimension | Evidence | Score |',
    '|---|---|---|---|',
    ...['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'].map((dimension) => `| runtime | ${dimension} | requirements | 4 |`),
    '- unresolved high-risk assumption: none',
    '## 未决决策与确认',
    '- unresolved high-risk decision: none',
    '- scope confirmed: true',
    '',
  ].join('\n'));
  const staleReference = writeClassificationV2Fixture(root, staleStatusId, { tier: 'L1' });
  fs.writeFileSync(path.join(staleStatusDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId: staleStatusId,
    lifecycle: 'active',
    stage: 'clarify',
    artifacts: { classification: staleReference },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  fs.appendFileSync(path.join(root, staleReference.path), '\n');
  const staleStatus = spawnSync(process.execPath, [workflow, 'status', staleStatusId, '--json'], {
    cwd: root, encoding: 'utf-8', shell: false,
  });
  assert.equal(staleStatus.status, 0, staleStatus.stderr);
  assert.equal(JSON.parse(staleStatus.stdout).clarifyReadiness.recovery.code, 'EH-CLARIFY-CLASSIFICATION-139');

  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
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

  const progressiveId = 'readiness-progressive';
  const progressiveDir = path.join(root, 'harness', 'changes', progressiveId);
  const progressiveRequirementsRef = `harness/changes/${progressiveId}/requirements.md`;
  const brief = `harness/changes/${progressiveId}/evidence/code-brief.md`;
  fs.mkdirSync(path.dirname(path.join(root, brief)), { recursive: true });
  fs.writeFileSync(path.join(root, brief), '# Code brief\n');
  const pendingPath = pendingQuestionPath(root, progressiveId);
  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(pendingPath, JSON.stringify({ status: 'pending' }));
  const requirementsText = ({ runId = 'none', packetRef = 'none', status = 'pending', remaining = 'unresolved', topology = false, ambiguity = false, approved = false } = {}) => [
    '# Requirements', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    `| code | yes | ${brief} | ${runId} | ${packetRef} | ${status} | codegraph-first |`,
    '| docs | no | none | none | none | not-required | No docs research needed. |',
    `- remaining fact uncertainty: ${remaining}`,
    '## 组件拓扑', '| Component | Description | Status |', '|---|---|---|',
    ...(topology ? ['| runtime | Workflow runtime | active |', '- topology confirmed: true'] : []),
    '## Component × Dimension 评分', '| Component | Dimension | Evidence | Score |', '|---|---|---|---|',
    ...(ambiguity ? [...['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'].map((dimension) => `| runtime | ${dimension} | requirements | 4 |`), '- unresolved high-risk assumption: none'] : []),
    '## 未决决策与确认', ...(ambiguity ? ['- unresolved high-risk decision: none'] : []),
    `- scope confirmed: ${approved ? 'true' : 'false'}`, '',
  ].join('\n');
  const assertProgress = (code) => {
    const projected = buildClarifyReadiness(root, progressiveId);
    assert.equal(projected.recovery?.code ?? null, code, JSON.stringify(projected.items));
    assert.equal(projected.items.length, 15);
    assert.equal(fs.existsSync(path.join(progressiveDir, 'clarify-readiness.json')), false);
    assert.equal(fs.existsSync(path.join(progressiveDir, 'checklist.json')), false);
    return projected;
  };
  assertProgress('EH-CLARIFY-RESEARCH-131');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText());
  assertProgress('EH-CLARIFY-RESEARCH-131');
  const researchHandoff = (uncertainties) => {
    const run = createHandoffV2(root, {
      changeId: progressiveId, stage: 'clarify', behavior: 'clarify.explore-code',
      agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' }, inputRefs: [brief],
      tecpc: { target: 'Resolve code facts', evidence: [brief], context: [brief], path: brief, correction: null },
    });
    const packet = {
      packetVersion: 1, type: 'research-packet', changeId: progressiveId, source: 'code-explore',
      question: 'What runtime is affected?', scope: ['runtime'], facts: [{ claim: 'Workflow runtime is affected.', sources: [brief] }],
      uncertainties, authority: 'codegraph-first', fallback: null, degraded: false, recommendedDecision: null,
      inputRefs: [...run.input.inputRefs], inputDigests: { ...run.input.inputDigests }, collectedAt: '2026-08-25T00:00:00.000Z',
    };
    persistHandoffV2Result(root, progressiveId, run.runId, packet);
    appendCompletedHandoffBinding(root, progressiveId, run.input, { agentId: `${run.runId}-researcher` });
    return { run, packetRef: path.relative(root, v2ResultPath(root, progressiveId, run.runId)).split(path.sep).join('/') };
  };
  const uncertain = researchHandoff(['Confirm one remaining fact.']);
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText({ runId: uncertain.run.runId, packetRef: uncertain.packetRef, status: 'complete' }));
  assertProgress('EH-CLARIFY-RESEARCH-131');
  const clean = researchHandoff([]);
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none' }));
  assertProgress('EH-CLARIFY-TOPOLOGY-132');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true }));
  assertProgress('EH-CLARIFY-AMBIGUITY-133');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true, ambiguity: true }));
  assertProgress('EH-CLARIFY-QUESTION-134');
  fs.writeFileSync(pendingPath, JSON.stringify({ status: 'resolved' }));
  assertProgress('EH-CLARIFY-DECISIONS-135');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Progressive fixture instructions\n');
  appendDecisionEvent(root, progressiveId, {
    eventVersion: 1, type: 'decision-event', eventId: 'progressive-scope', changeId: progressiveId, stage: 'clarify',
    actor: { type: 'user', id: 'test-user' }, decisionType: 'scope-confirmation', targetRef: progressiveRequirementsRef,
    questionId: 'progressive-question', options: ['confirm', 'revise'], recommendedOption: 'confirm', selectedOption: 'confirm',
    publicRationale: 'Scope confirmed.', evidenceRefs: ['CLAUDE.md'], inputDigests: { 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') },
    recordedAt: '2026-08-25T00:00:00.000Z',
  });
  sealClarifyDecisionSnapshot(root, progressiveId, readDecisionEvents(root, progressiveId).map(({ eventId }) => eventId));
  assertProgress('EH-CLARIFY-DEBT-136');
  writeDebtAssessment(root, progressiveId, {
    assessmentVersion: 1, type: 'debt-assessment', changeId: progressiveId, observations: [], dispositions: [],
    inputDigests: { 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') }, updatedAt: '2026-08-25T00:01:00.000Z',
  });
  assertProgress('EH-CLARIFY-CONTRACT-137');
  writeProjectContractAssessment(root, progressiveId, {
    assessmentVersion: 1, type: 'project-contract-assessment', changeId: progressiveId,
    files: [{ path: 'CLAUDE.md', digest: sha256Artifact(root, 'CLAUDE.md'), scope: 'project', ownership: 'project' }],
    gaps: [], conflicts: [], status: 'use-existing', decisionEventId: null, proposalRef: null,
    inputDigests: { 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') }, updatedAt: '2026-08-25T00:02:00.000Z',
  });
  assertProgress('EH-CLARIFY-REQUIREMENTS-138');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true, ambiguity: true, approved: true }));
  assertProgress('EH-CLARIFY-CLASSIFICATION-139');
  const progressiveClassification = writeClassificationV2Fixture(root, progressiveId, { tier: 'L1' }, 'progressive');
  fs.writeFileSync(path.join(progressiveDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6, revision: 1, changeId: progressiveId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification: progressiveClassification }, validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  assertProgress('EH-CLARIFY-SELF-CHECK-140');
  addClarifyCompletion(root, progressiveId, { stageStatus: 'block' });
  assertProgress('EH-CLARIFY-SELF-CHECK-140');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const untrustedCompletion = addClarifyCompletion(root, progressiveId, { reviewerTrusted: false, tecpcCorrection: 'Resolve correction.' });
  assertProgress('EH-CLARIFY-REVIEW-141');
  appendCompletedHandoffBinding(root, progressiveId, untrustedCompletion.check.input, { agentId: 'progressive-reviewer' });
  assertProgress('EH-CLARIFY-TECPC-142');
  await new Promise((resolve) => setTimeout(resolve, 10));
  const completeProgression = addClarifyCompletion(root, progressiveId);
  assertProgress('EH-CLARIFY-PROOF-143');
  const progressiveProof = (await import('../core/completion-proof.mjs')).buildCompletionProof(root, {
    stageResult: completeProgression.stageResult, reviewResult: completeProgression.review, createdAt: '2026-08-25T02:00:00.000Z',
  });
  const proofPath = path.join(progressiveDir, 'evidence', 'completion', 'clarify.json');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify({ ...progressiveProof, target: 'generic proof' }, null, 2)}\n`);
  assertProgress('EH-CLARIFY-PROOF-143');
  fs.writeFileSync(proofPath, `${JSON.stringify(progressiveProof, null, 2)}\n`);
  assertProgress(null);

  const completionCases = [
    ['blocked-stage', { stageStatus: 'block' }, 'self-check-passed', 'EH-CLARIFY-SELF-CHECK-140'],
    ['untrusted-reviewer', { reviewerTrusted: false }, 'independent-review-passed', 'EH-CLARIFY-REVIEW-141'],
    ['mismatched-reviewer', { reviewerMatches: false }, 'independent-review-passed', 'EH-CLARIFY-REVIEW-141'],
    ['pending-tecpc', { tecpcCorrection: 'Resolve remaining correction.' }, 'tecpc-complete', 'EH-CLARIFY-TECPC-142'],
    ['missing-proof', {}, 'clarify-proof-fresh', 'EH-CLARIFY-PROOF-143'],
    ['mismatched-proof', { proof: 'mismatched' }, 'clarify-proof-fresh', 'EH-CLARIFY-PROOF-143'],
    ['valid-proof', { proof: 'valid' }, 'clarify-proof-fresh', null],
  ];
  for (const [suffix, options, itemId, recoveryCode] of completionCases) {
    const candidateId = `readiness-${suffix}`;
    prepareClassifiedClarify(root, candidateId);
    addClarifyCompletion(root, candidateId, options);
    const candidate = buildClarifyReadiness(root, candidateId);
    assert.equal(candidate.items.find(({ id }) => id === itemId).status, recoveryCode ? 'blocked' : 'pass', suffix);
    assert.equal(candidate.recovery?.code ?? null, recoveryCode, suffix);
  }

  console.log(`PASS clarify-readiness ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
