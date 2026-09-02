import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  authorizeClarifyQuestion,
  pendingQuestionPath,
  prepareClarifyQuestion,
  questionCandidatePath,
  recoverClarifyQuestion,
  resolveClarifyQuestion,
} from '../core/clarify-question.mjs';
import { appendDecisionEvent, readDecisionEvents } from '../core/decision-ledger.mjs';
import {
  appendLaneApplicabilityFixture,
  ensureRequiredCodeResearchFixture,
} from './classification-v2-fixture.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const runtimeClarify = fileURLToPath(new URL('../clarify.mjs', import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-clarify-question-'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-clarify-question-outside-'));
const factGateFixtures = new Set();

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.CLAUDE_SESSION_ID;
  delete env.ENTERPRISE_HARNESS_SESSION_ID;
  return env;
}

function git(args, cwd = root) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function activate(changeId, { stage = 'clarify', schemaVersion = 6, lifecycle = 'active' } = {}) {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion,
    revision: 1,
    changeId,
    lifecycle,
    stage,
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`, 'utf-8');
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
}

function ensureFactGate(changeId) {
  if (factGateFixtures.has(changeId)) return;
  const requirementsRef = `harness/changes/${changeId}/requirements.md`;
  const requirementsPath = path.join(root, requirementsRef);
  const rawRequest = `Clarify the governed request for ${changeId}.`;
  fs.mkdirSync(path.dirname(requirementsPath), { recursive: true });
  fs.writeFileSync(requirementsPath, [
    '# Requirements', '', '## 目标与验收', '### 原始需求', rawRequest,
    '### 澄清后的目标', `Exercise ${changeId}.`, '', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | pending classification |',
    '| docs | no | none | none | none | not-required | no external facts required |',
    '- remaining fact uncertainty: none', '',
  ].join('\n'), 'utf-8');
  const sessionId = `fixture-${changeId}`;
  recordPromptReceipt(root, { session_id: sessionId, prompt: rawRequest });
  bindLatestPromptReceipt(root, changeId, sessionId);
  ensureRequiredCodeResearchFixture(root, changeId, requirementsRef);
  appendLaneApplicabilityFixture(root, changeId, requirementsRef);
  factGateFixtures.add(changeId);
}

function candidateFor(changeId, questionId = 'Q-003', overrides = {}, { factGate = true } = {}) {
  const inputRef = `harness/changes/${changeId}/requirements.md`;
  const inputPath = path.join(root, inputRef);
  if (factGate) ensureFactGate(changeId);
  if (!fs.existsSync(inputPath)) {
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, `requirements for ${changeId}\n`, 'utf-8');
  }
  const input = fs.readFileSync(inputPath);
  return {
    questionVersion: 1,
    type: 'clarify-question-candidate',
    changeId,
    questionId,
    componentId: 'refund',
    dimension: 'Constraints',
    decisionNeeded: 'Choose refund compatibility policy',
    whyUserOnly: 'Repository evidence cannot choose the business compatibility promise',
    decisionType: 'scope-confirmation',
    targetRef: inputRef,
    header: 'Refund',
    question: 'Which refund compatibility policy should this change guarantee?',
    options: [
      {
        id: 'strict',
        label: 'Strict parity',
        description: 'Preserve existing synchronous refund behavior.',
      },
      {
        id: 'async',
        label: 'Async migration',
        description: 'Allow asynchronous completion with a compatibility event.',
      },
    ],
    recommendedOption: 'strict',
    recommendationReason: 'It preserves the current externally observed contract.',
    evidenceRefs: [`harness/changes/${changeId}/requirements.md`],
    inputDigests: { [inputRef]: digest(input) },
    blocking: true,
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

function writeCandidate(candidate, ref = `harness/changes/${candidate.changeId}/evidence/clarify/questions/${candidate.questionId}.json`) {
  const target = path.join(root, ref);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(candidate, null, 2)}\n`, 'utf-8');
  return ref;
}

function askInput(candidate) {
  return {
    questions: [{
      question: candidate.question,
      header: candidate.header,
      options: candidate.options.map(({ id, label, description }) => ({
        label: id === candidate.recommendedOption ? `${label} (Recommended)` : label,
        description,
      })),
      multiSelect: false,
    }],
  };
}

function answer(candidate, label = 'Strict parity') {
  const selected = candidate.options.find((option) => option.label === label);
  const displayed = selected?.id === candidate.recommendedOption ? `${label} (Recommended)` : label;
  return { answers: { [candidate.question]: displayed } };
}

function assertCandidateRejected(changeId, candidate, pattern = /EH-QUESTION-CANDIDATE-/u) {
  activate(changeId);
  const ref = writeCandidate(candidate);
  assert.throws(() => prepareClarifyQuestion(root, changeId, ref), pattern);
}

try {
  git(['init', '--quiet']);

  assert.equal(
    questionCandidatePath('cancel-order', 'Q-003'),
    'harness/changes/cancel-order/evidence/clarify/questions/Q-003.json',
  );
  assert.throws(() => questionCandidatePath('../escape', 'Q-003'), /EH-PATH-001/u);
  assert.throws(() => questionCandidatePath('cancel-order', '../escape'), /EH-PATH-001/u);
  assert.throws(() => pendingQuestionPath(root, '../escape'), /EH-PATH-001/u);

  for (const [suffix, options] of [
    ['one-option', [{ id: 'only', label: 'Only', description: 'Only option.' }]],
    ['five-options', Array.from({ length: 5 }, (_, index) => ({
      id: `option-${index}`,
      label: `Option ${index}`,
      description: `Description ${index}`,
    }))],
  ]) {
    const changeId = `candidate-${suffix}`;
    assertCandidateRejected(changeId, candidateFor(changeId, 'Q-001', { options }));
  }

  const malformedChange = 'candidate-malformed';
  activate(malformedChange);
  const malformedRef = `harness/changes/${malformedChange}/evidence/clarify/questions/Q-001.json`;
  fs.mkdirSync(path.dirname(path.join(root, malformedRef)), { recursive: true });
  fs.writeFileSync(path.join(root, malformedRef), '{not-json}\n', 'utf-8');
  assert.throws(
    () => prepareClarifyQuestion(root, malformedChange, malformedRef),
    /EH-QUESTION-CANDIDATE-/u,
  );

  const mismatchChange = 'candidate-change-mismatch';
  activate(mismatchChange);
  const mismatchRef = `harness/changes/${mismatchChange}/evidence/clarify/questions/Q-001.json`;
  fs.mkdirSync(path.dirname(path.join(root, mismatchRef)), { recursive: true });
  fs.writeFileSync(
    path.join(root, mismatchRef),
    `${JSON.stringify(candidateFor('different-change', 'Q-001'), null, 2)}\n`,
    'utf-8',
  );
  assert.throws(
    () => prepareClarifyQuestion(root, mismatchChange, mismatchRef),
    /EH-QUESTION-CANDIDATE-/u,
  );

  const traversalChange = 'candidate-traversal';
  activate(traversalChange);
  assert.throws(
    () => prepareClarifyQuestion(root, traversalChange, '../outside.json'),
    /EH-PATH-001/u,
  );

  const staleInputChange = 'candidate-stale-input';
  activate(staleInputChange);
  const staleInputCandidate = candidateFor(staleInputChange, 'Q-001');
  const staleInputRef = writeCandidate(staleInputCandidate);
  const staleInputPath = path.join(root, Object.keys(staleInputCandidate.inputDigests)[0]);
  fs.appendFileSync(staleInputPath, 'changed\n', 'utf-8');
  assert.throws(
    () => prepareClarifyQuestion(root, staleInputChange, staleInputRef),
    /EH-QUESTION-STALE-/u,
  );

  const unboundEvidenceChange = 'candidate-unbound-evidence';
  activate(unboundEvidenceChange);
  const unboundCandidate = candidateFor(unboundEvidenceChange, 'Q-001');
  const packetRef = `harness/changes/${unboundEvidenceChange}/evidence/research/code.json`;
  fs.mkdirSync(path.dirname(path.join(root, packetRef)), { recursive: true });
  fs.writeFileSync(path.join(root, packetRef), '{"fact":"used"}\n');
  unboundCandidate.evidenceRefs.push(packetRef);
  assert.throws(
    () => prepareClarifyQuestion(root, unboundEvidenceChange, writeCandidate(unboundCandidate)),
    /EH-QUESTION-CANDIDATE-106.*inputDigests/u,
  );

  const packetMutationChange = 'candidate-packet-mutation';
  activate(packetMutationChange);
  const packetMutationCandidate = candidateFor(packetMutationChange, 'Q-001');
  const mutationPacketRef = `harness/changes/${packetMutationChange}/evidence/research/code.json`;
  const mutationPacket = '{"fact":"before"}\n';
  fs.mkdirSync(path.dirname(path.join(root, mutationPacketRef)), { recursive: true });
  fs.writeFileSync(path.join(root, mutationPacketRef), mutationPacket);
  packetMutationCandidate.evidenceRefs.push(mutationPacketRef);
  packetMutationCandidate.inputDigests[mutationPacketRef] = digest(mutationPacket);
  const mutationRef = writeCandidate(packetMutationCandidate);
  fs.writeFileSync(path.join(root, mutationPacketRef), '{"fact":"after"}\n');
  assert.throws(
    () => prepareClarifyQuestion(root, packetMutationChange, mutationRef),
    /EH-QUESTION-STALE-107/u,
  );

  const longHeaderChange = 'candidate-long-header';
  assertCandidateRejected(longHeaderChange, candidateFor(longHeaderChange, 'Q-001', {
    header: 'This header exceeds twelve',
  }));

  const symlinkChange = 'candidate-symlink';
  activate(symlinkChange);
  const symlinkCandidate = candidateFor(symlinkChange, 'Q-001');
  const symlinkRef = `harness/changes/${symlinkChange}/evidence/clarify/questions/Q-001.json`;
  const symlinkDir = path.dirname(path.join(root, symlinkRef));
  const outsideCandidate = path.join(outside, 'Q-001.json');
  fs.mkdirSync(symlinkDir, { recursive: true });
  fs.writeFileSync(outsideCandidate, `${JSON.stringify(symlinkCandidate, null, 2)}\n`, 'utf-8');
  try {
    fs.symlinkSync(outsideCandidate, path.join(root, symlinkRef), 'file');
    assert.throws(
      () => prepareClarifyQuestion(root, symlinkChange, symlinkRef),
      /EH-PATH-001/u,
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  }

  const evidenceSymlinkChange = 'evidence-symlink';
  activate(evidenceSymlinkChange);
  const evidenceSymlinkRef = `harness/changes/${evidenceSymlinkChange}/evidence/research/code.json`;
  const evidenceSymlinkPath = path.join(root, evidenceSymlinkRef);
  const outsideEvidence = path.join(outside, 'code.json');
  fs.mkdirSync(path.dirname(evidenceSymlinkPath), { recursive: true });
  fs.writeFileSync(outsideEvidence, '{"fact":"outside"}\n', 'utf-8');
  try {
    fs.symlinkSync(outsideEvidence, evidenceSymlinkPath, 'file');
    const evidenceSymlinkCandidate = candidateFor(evidenceSymlinkChange, 'Q-002', {
      evidenceRefs: [`${evidenceSymlinkRef}:12`],
      inputDigests: {
        [`harness/changes/${evidenceSymlinkChange}/requirements.md`]: digest(`requirements for ${evidenceSymlinkChange}\n`),
        [evidenceSymlinkRef]: digest('{"fact":"outside"}\n'),
      },
    });
    assert.throws(
      () => prepareClarifyQuestion(
        root,
        evidenceSymlinkChange,
        writeCandidate(evidenceSymlinkCandidate),
      ),
      /EH-PATH-001/u,
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  }

  const stateSymlinkChange = 'state-symlink';
  activate(stateSymlinkChange);
  const stateSymlinkDir = path.join(root, 'harness', 'changes', stateSymlinkChange);
  const outsideStateDir = path.join(outside, stateSymlinkChange);
  fs.renameSync(stateSymlinkDir, outsideStateDir);
  try {
    fs.symlinkSync(outsideStateDir, stateSymlinkDir, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => prepareClarifyQuestion(root, stateSymlinkChange, 'unused.json'),
      /EH-PATH-001/u,
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
  }

  const inactiveChange = 'inactive-question';
  activate(inactiveChange, { lifecycle: 'archived' });
  const inactiveCandidate = candidateFor(inactiveChange, 'Q-001');
  assert.throws(
    () => prepareClarifyQuestion(root, inactiveChange, writeCandidate(inactiveCandidate)),
    /EH-QUESTION-ACTIVE-/u,
  );

  const designChange = 'design-question';
  activate(designChange, { stage: 'design' });
  const designCandidate = candidateFor(designChange, 'Q-001');
  assert.throws(
    () => prepareClarifyQuestion(root, designChange, writeCandidate(designCandidate)),
    /EH-QUESTION-ACTIVE-/u,
  );

  const v5Change = 'v5-question';
  activate(v5Change, { schemaVersion: 5 });
  const v5Candidate = candidateFor(v5Change, 'Q-001');
  assert.throws(
    () => prepareClarifyQuestion(root, v5Change, writeCandidate(v5Candidate)),
    /EH-QUESTION-ACTIVE-/u,
  );

  const missingPendingChange = 'missing-pending';
  activate(missingPendingChange);
  const missingPendingCandidate = candidateFor(missingPendingChange, 'Q-001');
  assert.throws(
    () => authorizeClarifyQuestion(root, askInput(missingPendingCandidate)),
    /EH-QUESTION-PENDING-/u,
  );
  assert.throws(
    () => resolveClarifyQuestion(root, askInput(missingPendingCandidate), answer(missingPendingCandidate)),
    /EH-QUESTION-PENDING-/u,
  );

  const staleCandidateChange = 'stale-candidate';
  activate(staleCandidateChange);
  const staleCandidate = candidateFor(staleCandidateChange, 'Q-001');
  const staleCandidateRef = writeCandidate(staleCandidate);
  prepareClarifyQuestion(root, staleCandidateChange, staleCandidateRef);
  fs.writeFileSync(
    path.join(root, staleCandidateRef),
    `${JSON.stringify({ ...staleCandidate, question: `${staleCandidate.question} Changed.` }, null, 2)}\n`,
    'utf-8',
  );
  assert.throws(
    () => authorizeClarifyQuestion(root, askInput(staleCandidate)),
    /EH-QUESTION-STALE-/u,
  );

  const blockedFactGateChange = 'blocked-fact-gate';
  activate(blockedFactGateChange);
  const blockedFactGateCandidate = candidateFor(blockedFactGateChange, 'Q-002', {}, { factGate: false });
  const blockedFactGateRef = writeCandidate(blockedFactGateCandidate);
  assert.throws(
    () => prepareClarifyQuestion(root, blockedFactGateChange, blockedFactGateRef),
    /EH-QUESTION-FACT-GATE-161/u,
    'question preparation must fail closed before required research evidence exists',
  );
  assert.equal(fs.existsSync(pendingQuestionPath(root, blockedFactGateChange)), false);

  const staleFactGateChange = 'stale-fact-gate';
  activate(staleFactGateChange);
  const staleFactGateCandidate = candidateFor(staleFactGateChange, 'Q-002');
  const staleFactGateRef = writeCandidate(staleFactGateCandidate);
  prepareClarifyQuestion(root, staleFactGateChange, staleFactGateRef);
  const codeLane = fs.readFileSync(
    path.join(root, `harness/changes/${staleFactGateChange}/requirements.md`),
    'utf-8',
  ).split('\n').find((line) => /^\|\s*code\s*\|/u.test(line));
  const researchPacketRef = codeLane.split('|').map((cell) => cell.trim())[5];
  const researchPacketPath = path.join(root, researchPacketRef);
  const researchPacket = JSON.parse(fs.readFileSync(researchPacketPath, 'utf-8'));
  fs.writeFileSync(
    researchPacketPath,
    `${JSON.stringify({ ...researchPacket, uncertainties: ['new unresolved fact'] }, null, 2)}\n`,
  );
  assert.throws(
    () => authorizeClarifyQuestion(root, askInput(staleFactGateCandidate)),
    /EH-QUESTION-FACT-GATE-161/u,
    'AskUserQuestion authorization must recheck research freshness after prepare',
  );

  const changeId = 'cancel-order';
  activate(changeId);
  const candidate = candidateFor(changeId);
  const candidateRef = writeCandidate(candidate);
  const pending = prepareClarifyQuestion(root, changeId, candidateRef);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.changeId, changeId);
  assert.equal(pending.questionId, 'Q-003');
  assert.equal(pending.candidateRef, candidateRef);
  assert.match(pending.candidateDigest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    authorizeClarifyQuestion(root, askInput(candidate)),
    { changeId, questionId: 'Q-003' },
  );

  const reorderedInput = {
    questions: [{
      multiSelect: false,
      options: askInput(candidate).questions[0].options.map(({ label, description }) => ({ description, label })),
      header: candidate.header,
      question: candidate.question,
    }],
  };
  assert.deepEqual(
    authorizeClarifyQuestion(root, reorderedInput),
    { changeId, questionId: 'Q-003' },
  );

  for (const changedInput of [
    { questions: [] },
    { questions: [askInput(candidate).questions[0], askInput(candidate).questions[0]] },
    { questions: [{ ...askInput(candidate).questions[0], multiSelect: true }] },
    { questions: [{ ...askInput(candidate).questions[0], question: `${candidate.question} Please answer.` }] },
    { questions: [{
      ...askInput(candidate).questions[0],
      options: [{ ...askInput(candidate).questions[0].options[0], description: 'Changed description.' }, askInput(candidate).questions[0].options[1]],
    }] },
    { questions: [{ ...askInput(candidate).questions[0], options: askInput(candidate).questions[0].options.slice(0, 1) }] },
    { questions: [{
      ...askInput(candidate).questions[0],
      options: Array.from({ length: 5 }, (_, index) => ({ label: `Option ${index}`, description: `Description ${index}` })),
    }] },
  ]) {
    assert.throws(
      () => authorizeClarifyQuestion(root, changedInput),
      /EH-QUESTION-MISMATCH-112/u,
    );
  }

  const secondCandidate = candidateFor(changeId, 'Q-004', {
    question: 'Should this also preserve cancellation timing?',
  });
  const secondRef = writeCandidate(secondCandidate);
  assert.throws(
    () => prepareClarifyQuestion(root, changeId, secondRef),
    /EH-QUESTION-PENDING-110/u,
  );

  const restart = spawnSync(
    process.execPath,
    [runtimeClarify, 'status', changeId, '--json'],
    { cwd: root, encoding: 'utf-8', env: cleanEnv(), shell: false },
  );
  assert.equal(restart.status, 0, restart.stderr);
  assert.equal(JSON.parse(restart.stdout).status, 'pending');
  assert.deepEqual(JSON.parse(restart.stdout).ambiguitySummary, {
    index: null, coveredPredicates: 0, totalPredicates: 0, unresolvedHighRiskCount: 0,
    highRiskStatus: 'not-applicable', components: [],
  });
  assert.equal(
    JSON.parse(restart.stdout).recovery,
    '重新询问已授权的待回答问题 Q-003，不得修改问题正文或选项。',
  );

  const otherChange = 'safe-other';
  activate(otherChange);
  const otherCandidate = candidateFor(otherChange, 'Q-020');
  const otherRef = writeCandidate(otherCandidate);
  prepareClarifyQuestion(root, otherChange, otherRef);
  assert.deepEqual(
    resolveClarifyQuestion(root, askInput(otherCandidate), answer(otherCandidate, 'Need a custom secret value')),
    { eventId: 'D-020', duplicate: false },
  );
  const [otherEvent] = readDecisionEvents(root, otherChange)
    .filter(({ decisionType }) => decisionType !== 'lane-applicability');
  assert.equal(otherEvent.decisionType, 'clarify-answer');
  assert.equal(otherEvent.targetRef, otherRef);
  assert.equal(otherEvent.selectedOption, 'other');
  assert.equal(otherEvent.options.at(-1), 'other');
  assert.equal(JSON.stringify(otherEvent).includes('custom secret'), false);

  activate(changeId);
  const resolved = resolveClarifyQuestion(root, askInput(candidate), answer(candidate));
  assert.deepEqual(resolved, { eventId: 'D-003', duplicate: false });
  assert.deepEqual(
    resolveClarifyQuestion(root, askInput(candidate), answer(candidate)),
    { eventId: 'D-003', duplicate: true },
  );
  assert.throws(
    () => resolveClarifyQuestion(root, askInput(candidate), answer(candidate, 'Async migration')),
    /EH-QUESTION-ANSWER-/u,
  );
  const [event] = readDecisionEvents(root, changeId)
    .filter(({ decisionType }) => decisionType !== 'lane-applicability');
  assert.equal(event.selectedOption, 'strict');
  assert.equal(event.decisionType, 'scope-confirmation');
  assert.equal(event.targetRef, `harness/changes/${changeId}/requirements.md`);
  assert.equal(event.publicRationale, 'Selected by the user through AskUserQuestion.');
  assert.equal(event.actor.id, 'interactive-user');
  assert.equal(JSON.stringify(event).includes('Not an option'), false);
  assert.equal(JSON.stringify(event).includes('chat'), false);

  const unresolvedChange = 'restart-unresolved';
  activate(unresolvedChange);
  const unresolvedCandidate = candidateFor(unresolvedChange, 'Q-010');
  prepareClarifyQuestion(root, unresolvedChange, writeCandidate(unresolvedCandidate));
  assert.deepEqual(recoverClarifyQuestion(root, unresolvedChange), {
    status: 'pending',
    recovery: '重新询问已授权的待回答问题 Q-010，不得修改问题正文或选项。',
  });

  const crashChange = 'crash-recovery';
  activate(crashChange);
  const crashCandidate = candidateFor(crashChange, 'Q-011');
  const crashRef = writeCandidate(crashCandidate);
  prepareClarifyQuestion(root, crashChange, crashRef);
  appendDecisionEvent(root, crashChange, {
    eventVersion: 1,
    type: 'decision-event',
    eventId: 'D-011',
    changeId: crashChange,
    stage: 'clarify',
    actor: { type: 'user', id: 'interactive-user' },
    decisionType: crashCandidate.decisionType,
    targetRef: crashCandidate.targetRef,
    questionId: 'Q-011',
    options: crashCandidate.options.map(({ id }) => id),
    recommendedOption: crashCandidate.recommendedOption,
    selectedOption: 'strict',
    publicRationale: 'Selected by the user through AskUserQuestion.',
    evidenceRefs: crashCandidate.evidenceRefs,
    inputDigests: crashCandidate.inputDigests,
    recordedAt: '2026-08-25T01:00:00.000Z',
  });
  const crashStatus = spawnSync(
    process.execPath,
    [runtimeClarify, 'status', crashChange, '--json'],
    { cwd: root, encoding: 'utf-8', env: cleanEnv(), shell: false },
  );
  assert.equal(crashStatus.status, 0, crashStatus.stderr);
  assert.deepEqual(JSON.parse(crashStatus.stdout), {
    status: 'repair-required',
    recovery: `运行 enterprise-harness clarify recover ${crashChange}。`,
    eventId: 'D-011',
    ambiguitySummary: {
      index: null, coveredPredicates: 0, totalPredicates: 0, unresolvedHighRiskCount: 0,
      highRiskStatus: 'not-applicable', components: [],
    },
  });
  assert.equal(
    JSON.parse(fs.readFileSync(pendingQuestionPath(root, crashChange), 'utf-8')).status,
    'pending',
  );
  const crashNextCandidate = candidateFor(crashChange, 'Q-012', {
    question: 'Which follow-up compatibility policy should apply?',
  });
  const crashNextRef = writeCandidate(crashNextCandidate);
  assert.throws(
    () => prepareClarifyQuestion(root, crashChange, crashNextRef),
    /EH-QUESTION-PENDING-110/u,
  );

  const crashRecover = spawnSync(
    process.execPath,
    [runtimeClarify, 'recover', crashChange],
    { cwd: root, encoding: 'utf-8', env: cleanEnv(), shell: false },
  );
  assert.equal(crashRecover.status, 0, crashRecover.stderr);
  assert.deepEqual(JSON.parse(crashRecover.stdout), {
    status: 'resolved',
    recovery: null,
    eventId: 'D-011',
  });
  assert.equal(
    JSON.parse(fs.readFileSync(pendingQuestionPath(root, crashChange), 'utf-8')).status,
    'resolved',
  );
  assert.deepEqual(recoverClarifyQuestion(root, crashChange), {
    status: 'resolved',
    recovery: null,
    eventId: 'D-011',
  });
  assert.throws(
    () => prepareClarifyQuestion(root, crashChange, crashNextRef),
    /EH-QUESTION-TARGET-115/u,
    'a resolved typed target must not be asked again under a new questionId',
  );

  activate('missing-recovery');
  assert.deepEqual(recoverClarifyQuestion(root, 'missing-recovery'), {
    status: 'missing',
    recovery: null,
  });

  console.log(`PASS clarify-question ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
