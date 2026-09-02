import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareClarifyQuestion } from '../core/clarify-question.mjs';
import { readDecisionEvents } from '../core/decision-ledger.mjs';
import {
  appendLaneApplicabilityFixture,
  ensureRequiredCodeResearchFixture,
} from './classification-v2-fixture.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const preHook = path.join(sourceRoot, 'hooks', 'scripts', 'pre-question.mjs');
const postHook = path.join(sourceRoot, 'hooks', 'scripts', 'post-question.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-clarify-question-hook-'));
const factGateFixtures = new Set();

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf-8', shell: false });
  assert.equal(result.status, 0, result.stderr);
}

function activate(changeId, stage = 'clarify') {
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6,
    revision: 1,
    changeId,
    lifecycle: 'active',
    stage,
    artifacts: { classification: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`, 'utf-8');
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

function candidateFor(changeId, questionId = 'Q-001') {
  const inputRef = `harness/changes/${changeId}/requirements.md`;
  ensureFactGate(changeId);
  const input = fs.readFileSync(path.join(root, inputRef));
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
      { id: 'strict', label: 'Strict parity', description: 'Preserve existing synchronous refund behavior.' },
      { id: 'async', label: 'Async migration', description: 'Allow asynchronous completion with a compatibility event.' },
    ],
    recommendedOption: 'strict',
    recommendationReason: 'It preserves the current externally observed contract.',
    evidenceRefs: [inputRef],
    inputDigests: { [inputRef]: digest(input) },
    blocking: true,
    createdAt: '2026-08-25T00:00:00.000Z',
  };
}

function writeCandidate(candidate) {
  const ref = `harness/changes/${candidate.changeId}/evidence/clarify/questions/${candidate.questionId}.json`;
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
  return { answers: { [candidate.question]: selected?.id === candidate.recommendedOption ? `${label} (Recommended)` : label } };
}

function run(hook, payload, input = JSON.stringify(payload)) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [hook], {
    cwd: root,
    encoding: 'utf-8',
    input,
    shell: false,
  });
  return { ...result, elapsedMs: Number(process.hrtime.bigint() - started) / 1e6 };
}

try {
  git(['init', '--quiet']);

  const noActive = { tool_input: { questions: [] }, tool_response: { answers: {} } };
  assert.equal(run(preHook, noActive).status, 0, 'no active harness change must pass the pre-hook');
  assert.equal(run(postHook, noActive).status, 0, 'no active harness change must pass the post-hook');

  const nonClarifyChange = 'design-question';
  activate(nonClarifyChange, 'design');
  const nonClarify = run(preHook, { tool_input: { questions: [] } });
  assert.equal(nonClarify.status, 2, 'active non-Clarify change must block');
  assert.match(nonClarify.stderr, /BLOCK \[EH-QUESTION-ACTIVE-108\]/u);

  const malformed = run(preHook, {}, '{not-json');
  assert.equal(malformed.status, 2, 'malformed hook stdin must block');
  assert.match(malformed.stderr, /BLOCK \[EH-HOOK-INPUT-017\]/u);

  const malformedShapeChange = 'malformed-shape';
  activate(malformedShapeChange);
  for (const [hook, raw, label] of [
    [preHook, 'null', 'null pre-hook payload'],
    [postHook, 'null', 'null post-hook payload'],
    [preHook, '[]', 'array pre-hook payload'],
    [postHook, '[]', 'array post-hook payload'],
    [preHook, '{}', 'pre-hook missing tool_input'],
    [postHook, '{}', 'post-hook missing tool fields'],
  ]) {
    const malformedShape = run(hook, null, raw);
    assert.equal(malformedShape.status, 2, `${label} must fail closed`);
    assert.match(malformedShape.stderr, /BLOCK \[EH-QUESTION-INPUT-115\]/u);
    assert.doesNotMatch(malformedShape.stderr, /node:internal|at file:/u, `${label} must not leak a stack`);
  }

  const staleChange = 'stale-question';
  activate(staleChange);
  const staleCandidate = candidateFor(staleChange);
  const staleRef = writeCandidate(staleCandidate);
  prepareClarifyQuestion(root, staleChange, staleRef);
  fs.writeFileSync(
    path.join(root, staleRef),
    `${JSON.stringify({ ...staleCandidate, question: `${staleCandidate.question} Changed.` }, null, 2)}\n`,
    'utf-8',
  );
  const stale = run(preHook, { tool_input: askInput(staleCandidate) });
  assert.equal(stale.status, 2, 'stale pending candidate must block');
  assert.match(stale.stderr, /BLOCK \[EH-QUESTION-STALE-107\]/u);

  const changeId = 'cancel-order';
  activate(changeId);
  const candidate = candidateFor(changeId, 'Q-003');
  prepareClarifyQuestion(root, changeId, writeCandidate(candidate));
  const authorizedPayload = { tool_use_id: 'toolu_question_authorized', tool_input: askInput(candidate) };
  const unauthorizedPayload = {
    tool_use_id: 'toolu_question_denied',
    tool_input: {
      ...askInput(candidate),
      questions: [{ ...askInput(candidate).questions[0], question: 'A changed question.' }],
    },
  };
  const answeredPayload = {
    tool_use_id: 'toolu_question_answered',
    tool_input: askInput(candidate),
    tool_response: answer(candidate),
  };

  const authorized = run(preHook, authorizedPayload);
  assert.equal(authorized.status, 0, authorized.stderr);
  assert.equal(authorized.stdout, '');
  const unauthorized = run(preHook, unauthorizedPayload);
  assert.equal(unauthorized.status, 2);
  assert.match(unauthorized.stderr, /BLOCK \[EH-QUESTION-MISMATCH-112\]/u);
  assert.match(unauthorized.stderr, /原样重问 pending question/u, 'authorization denial must include its recovery');
  const unauthorizedRetry = run(preHook, unauthorizedPayload);
  assert.equal(unauthorizedRetry.status, 2, 'a denied same-ID pre-hook delivery must remain denied');
  assert.match(unauthorizedRetry.stderr, /BLOCK \[EH-QUESTION-MISMATCH-112\]/u);

  const answered = run(postHook, answeredPayload);
  assert.equal(answered.status, 0, answered.stderr);
  assert.equal(answered.stdout, '');
  assert.equal(readDecisionEvents(root, changeId).filter(({ decisionType }) => decisionType !== 'lane-applicability').length, 1);
  const duplicate = run(postHook, answeredPayload);
  assert.equal(duplicate.status, 0, duplicate.stderr);
  assert.equal(duplicate.stdout, '');
  assert.equal(readDecisionEvents(root, changeId).filter(({ decisionType }) => decisionType !== 'lane-applicability').length, 1, 'duplicate PostToolUse must not append a ledger event');

  const retryChange = 'retry-answer';
  activate(retryChange);
  const retryCandidate = candidateFor(retryChange, 'Q-004');
  prepareClarifyQuestion(root, retryChange, writeCandidate(retryCandidate));
  const failedAnswerPayload = {
    tool_use_id: 'toolu_question_failed_answer',
    tool_input: askInput(retryCandidate),
    tool_response: answer(retryCandidate, 'Not an option'),
  };
  const failedAnswer = run(postHook, failedAnswerPayload);
  assert.equal(failedAnswer.status, 0, failedAnswer.stderr);
  const [otherEvent] = readDecisionEvents(root, retryChange)
    .filter(({ decisionType }) => decisionType !== 'lane-applicability');
  assert.equal(otherEvent.selectedOption, 'other');
  assert.equal(JSON.stringify(otherEvent).includes('Not an option'), false, 'free-form Other text must not be persisted');

  const brokenChange = 'broken-state';
  activate(brokenChange);
  fs.writeFileSync(path.join(root, 'harness', 'changes', brokenChange, 'state.json'), '{not-json\n', 'utf-8');
  const runtimeFailure = run(preHook, { tool_input: { questions: [] } });
  assert.equal(runtimeFailure.status, 2, 'runtime exceptions must fail closed');
  assert.match(runtimeFailure.stderr, /BLOCK \[EH-QUESTION-ACTIVE-108\]/u);
  assert.match(runtimeFailure.stderr, /invalid state JSON/u, 'runtime exception detail must remain visible');

  assert.ok(authorized.elapsedMs <= 100, `pre-question must finish within 100 ms after fixture setup (got ${authorized.elapsedMs.toFixed(1)} ms)`);
  assert.ok(answered.elapsedMs <= 100, `post-question must finish within 100 ms after fixture setup (got ${answered.elapsedMs.toFixed(1)} ms)`);
  console.log(`PASS clarify-question-hook ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
