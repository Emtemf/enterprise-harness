import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { buildClarifyReadiness, CLARIFY_ITEMS } from '../lib/clarify-readiness.mjs';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';
import { appendLaneApplicabilityFixture, ensureRequiredCodeResearchFixture, writeClassificationV2Fixture } from './classification-v2-fixture.mjs';
import { addClarifyCompletion, approvedRequirements, prepareClassifiedClarify } from './clarify-readiness-fixture.mjs';
import { appendCompletedHandoffBinding } from './handoff-binding-fixture.mjs';
import { appendDecisionEvent, readDecisionEvents, sealClarifyDecisionSnapshot } from '../core/decision-ledger.mjs';
import { writeDebtAssessment, writeProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { pendingQuestionPath } from '../core/clarify-question.mjs';
import { resolveStageCompletionCandidate, stageCompletionFor } from '../lib/stage-results.mjs';
import { bindLatestPromptReceipt, recordPromptReceipt } from '../lib/prompt-receipts.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-readiness-'));
const changeId = 'readiness-v2';
const changeDir = path.join(root, 'harness', 'changes', changeId);

function controllerRoutesFromWorkflowStatus(status) {
  const route = { research: 'R', decisions: 'D', completion: 'C', transition: 'T' }[
    status.clarifyReadiness.route
  ];
  return route ? [route] : [];
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  const before = new Set(fs.readdirSync(changeDir));
  const readiness = buildClarifyReadiness(root, changeId);
  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.route, 'research');
  assert.deepEqual(readiness.ambiguitySummary, {
    index: null,
    coveredPredicates: 0,
    totalPredicates: 0,
    unresolvedHighRiskCount: 0,
    highRiskStatus: 'not-applicable',
    components: [],
  });
  assert.deepEqual(readiness.items.map(({ id }) => id), CLARIFY_ITEMS);
  assert.equal(readiness.items.length, 14);
  assert.ok(readiness.items.every((item) => (
    CLARIFY_ITEMS.includes(item.id)
      && ['pass', 'blocked', 'stale', 'not-applicable'].includes(item.status)
      && Array.isArray(item.evidenceRefs)
      && typeof item.code === 'string'
      && typeof item.action === 'string'
  )));
  assert.deepEqual(readiness.recovery, {
    code: 'EH-CLARIFY-RESEARCH-LANES-144',
    action: '判定代码与外部文档两条研究通道是否适用。',
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
  assert.equal(projection.clarifyReadiness.items.length, 14);
  assert.equal(Object.hasOwn(projection, 'designReadiness'), false, 'non-Design status shape must remain compatible');
  assert.equal(projection.clarifyReadiness.route, 'research');
  assert.deepEqual(projection.clarifyReadiness.recovery, readiness.recovery);
  assert.deepEqual(projection.clarifyReadiness.ambiguitySummary, readiness.ambiguitySummary);
  const textStatus = spawnSync(process.execPath, [workflow, 'status', changeId], {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
  });
  assert.equal(textStatus.status, 0, textStatus.stderr);
  assert.match(textStatus.stdout, /clarifyReadiness: 1\/14 passed/u);
  assert.match(textStatus.stdout, /歧义指数: 尚不可计算/u);
  assert.equal((textStatus.stdout.match(/recovery:/gu) || []).length, 1);
  assert.match(textStatus.stdout, /EH-CLARIFY-RESEARCH-LANES-144/u);

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
  fs.writeFileSync(path.join(staleStatusDir, 'requirements.md'), approvedRequirements());
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

  const bypassId = 'readiness-empty-not-required';
  const bypassRef = `harness/changes/${bypassId}/requirements.md`;
  fs.mkdirSync(path.dirname(path.join(root, bypassRef)), { recursive: true });
  fs.writeFileSync(path.join(root, bypassRef), [
    '# Requirements', '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    '| code | no | none | none | none | not-required | |',
    '| docs | no | none | none | none | not-required | |',
    '- remaining fact uncertainty: none', '',
  ].join('\n'));
  appendLaneApplicabilityFixture(root, bypassId, bypassRef);
  const bypassReadiness = buildClarifyReadiness(root, bypassId);
  assert.equal(bypassReadiness.route, 'research');
  assert.equal(
    bypassReadiness.items.find(({ id }) => id === 'required-research-fresh').status,
    'blocked',
    'empty not-required rationales must never satisfy the mechanical research gate',
  );

  const selfAuthoredId = 'readiness-self-authored-lanes';
  const selfAuthoredRef = `harness/changes/${selfAuthoredId}/requirements.md`;
  const selfAuthoredText = approvedRequirements();
  fs.mkdirSync(path.dirname(path.join(root, selfAuthoredRef)), { recursive: true });
  fs.writeFileSync(path.join(root, selfAuthoredRef), selfAuthoredText);
  const sideRef = `harness/changes/${selfAuthoredId}/self-authored.txt`;
  fs.writeFileSync(path.join(root, sideRef), 'Main says research is unnecessary.\n');
  const sideDigest = sha256Artifact(root, sideRef);
  const requirementsDigest = sha256Artifact(root, selfAuthoredRef);
  for (const lane of ['code', 'docs']) appendDecisionEvent(root, selfAuthoredId, {
    eventVersion: 1, type: 'decision-event', eventId: `self-authored-${lane}`, changeId: selfAuthoredId,
    stage: 'clarify', actor: { type: 'main', id: 'main-agent' }, decisionType: 'lane-applicability',
    targetRef: `${selfAuthoredRef}#fact-lane-${lane}#sha256=${requirementsDigest}`,
    questionId: `self-authored-${lane}-question`, options: ['required', 'not-required'],
    recommendedOption: 'not-required', selectedOption: 'not-required', publicRationale: 'Main self-authorizes.',
    evidenceRefs: [selfAuthoredRef, sideRef],
    inputDigests: { [selfAuthoredRef]: requirementsDigest, [sideRef]: sideDigest },
    recordedAt: '2026-08-25T00:00:00.000Z',
  });
  const selfAuthored = buildClarifyReadiness(root, selfAuthoredId);
  assert.equal(selfAuthored.route, 'research');
  assert.equal(selfAuthored.items.find(({ id }) => id === 'required-research-fresh').status, 'blocked',
    'main-authored requirements plus a side file cannot replace a host-attested user request');

  const lowInfoId = 'readiness-low-information';
  const lowInfoRef = `harness/changes/${lowInfoId}/requirements.md`;
  fs.mkdirSync(path.dirname(path.join(root, lowInfoRef)), { recursive: true });
  fs.writeFileSync(path.join(root, lowInfoRef), [
    '# Requirements', '## 目标与验收', '### 原始需求', 'x', '### 澄清后的目标', 'x',
    '## 事实探索门禁', '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|', '| code | no | none | none | none | not-required | x |',
    '| docs | no | none | none | none | not-required | x |', '- remaining fact uncertainty: none',
    '## 组件拓扑', '| Component | Outcome / boundary | Status | Depends on | Confirmation source |',
    '|---|---|---|---|---|', '| x | x | active | none | E-X |', '- topology confirmed: true',
    '## Evidence ledger', '| Evidence ID | Kind | Locator | Claim | Supports |', '|---|---|---|---|---|',
    '| E-X | raw-request | original-request | x | x:Goal.consumer |',
    '## Component × Dimension 评分',
    '| Component | Dimension | 上轮分数 | 本轮分数 | Predicate coverage | Evidence refs | Gap | Gap type | Owner / status |',
    '|---|---|---:|---:|---|---|---|---|---|',
    ...['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'].map((dimension) => `| x | ${dimension} | 4 | 4 | x | E-X | none | resolved | x |`),
    '- unresolved high-risk assumption: none', '## 未决决策与确认', '- unresolved high-risk decision: none',
    '- scope confirmed: true', '',
  ].join('\n'));
  recordPromptReceipt(root, { session_id: `fixture-${lowInfoId}`, prompt: 'x' });
  bindLatestPromptReceipt(root, lowInfoId, `fixture-${lowInfoId}`);
  ensureRequiredCodeResearchFixture(root, lowInfoId, lowInfoRef);
  appendLaneApplicabilityFixture(root, lowInfoId, lowInfoRef);
  const lowInfo = buildClarifyReadiness(root, lowInfoId);
  assert.deepEqual(lowInfo.items.slice(0, 5).map(({ status }) => status), [
    'pass', 'pass', 'pass', 'blocked', 'blocked',
  ], 'a low-information topology and self-referential score table must not pass readiness');

  const progressiveId = 'readiness-progressive';
  const progressiveDir = path.join(root, 'harness', 'changes', progressiveId);
  const progressiveRequirementsRef = `harness/changes/${progressiveId}/requirements.md`;
  const brief = `harness/changes/${progressiveId}/evidence/code-brief.md`;
  fs.mkdirSync(path.dirname(path.join(root, brief)), { recursive: true });
  fs.writeFileSync(path.join(root, brief), '# Code brief\n');
  const pendingPath = pendingQuestionPath(root, progressiveId);
  fs.mkdirSync(path.dirname(pendingPath), { recursive: true });
  fs.writeFileSync(pendingPath, JSON.stringify({ status: 'pending' }));
  const progressivePredicates = {
    Goal: ['consumer', 'outcome'], Scope: ['included', 'excluded'], Constraints: ['technical', 'risk'],
    Acceptance: ['success', 'failure', 'observable'], Context: ['need', 'current-state'],
  };
  const progressiveEvidence = Object.entries(progressivePredicates).flatMap(([dimension, names]) => (
    names.map((predicate) => ({
      id: `E-${dimension.toUpperCase()}-${predicate.toUpperCase()}`,
      support: `runtime:${dimension}.${predicate}`,
      claim: `Progressive claim for runtime ${dimension} ${predicate}`,
    }))
  ));
  const requirementsText = ({ runId = 'none', packetRef = 'none', status = 'pending', remaining = 'unresolved', topology = false, ambiguity = false, approved = false } = {}) => [
    '# Requirements', '## 目标与验收', '### 原始需求',
    progressiveEvidence.map(({ claim }) => claim).join('；'),
    '### 澄清后的目标', 'Use the progressive fixture requirements.',
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    `| code | yes | ${brief} | ${runId} | ${packetRef} | ${status} | codegraph-first |`,
    '| docs | no | none | none | none | not-required | No docs research needed. |',
    `- remaining fact uncertainty: ${remaining}`,
    '## 组件拓扑', '| Component | Outcome / boundary | Status | Depends on | Confirmation source |', '|---|---|---|---|---|',
    ...(topology ? ['| runtime | Workflow runtime | active | none | E-GOAL-CONSUMER |', '- topology confirmed: true'] : []),
    '## Evidence ledger', '| Evidence ID | Kind | Locator | Claim | Supports |', '|---|---|---|---|---|',
    ...progressiveEvidence.map(({ id, support, claim }) => `| ${id} | raw-request | original-request | ${claim} | ${support} |`),
    '## Component × Dimension 评分',
    '| Component | Dimension | 上轮分数 | 本轮分数 | Predicate coverage | Evidence refs | Gap / unresolved decision | Gap type | Owner / status |',
    '|---|---|---:|---:|---|---|---|---|---|',
    ...(ambiguity ? [...Object.entries(progressivePredicates).map(([dimension, names]) => `| runtime | ${dimension} | 4 | 4 | ${names.join(',')} | ${names.map((predicate) => `E-${dimension.toUpperCase()}-${predicate.toUpperCase()}`).join(',')} | none | resolved | agent / resolved |`), '- unresolved high-risk assumption: none'] : []),
    '## 未决决策与确认', ...(ambiguity ? ['- unresolved high-risk decision: none'] : []),
    `- scope confirmed: ${approved ? 'true' : 'false'}`, '',
  ].join('\n');
  const writeProgressiveRequirements = (options = {}) => {
    fs.writeFileSync(path.join(root, progressiveRequirementsRef), requirementsText(options));
    if (!fs.existsSync(path.join(root, '.git', 'enterprise-harness', 'prompt-receipts', 'bindings', `${progressiveId}.json`))) {
      recordPromptReceipt(root, {
        session_id: `fixture-${progressiveId}`,
        prompt: progressiveEvidence.map(({ claim }) => claim).join('；'),
      });
      bindLatestPromptReceipt(root, progressiveId, `fixture-${progressiveId}`);
    }
    appendLaneApplicabilityFixture(root, progressiveId, progressiveRequirementsRef, {
      code: 'required', docs: 'not-required',
    });
  };
  const recovery = {
    lanes: { code: 'EH-CLARIFY-RESEARCH-LANES-144', action: '判定代码与外部文档两条研究通道是否适用。' },
    research: { code: 'EH-CLARIFY-RESEARCH-131', action: '完成并持久化每个必需的 ResearchPacket。' },
    conflicts: { code: 'EH-CLARIFY-RESEARCH-CONFLICTS-145', action: '处置降级研究、证据冲突和剩余事实不确定性。' },
    topology: { code: 'EH-CLARIFY-TOPOLOGY-132', action: '确认由证据推导出的组件拓扑。' },
    ambiguity: { code: 'EH-CLARIFY-AMBIGUITY-133', action: '解决证据约束下最薄弱的歧义点并重新计算需求。' },
    question: { code: 'EH-CLARIFY-QUESTION-134', action: '解决当前唯一获准的 Clarify 待回答问题。' },
    decisions: { code: 'EH-CLARIFY-DECISIONS-135', action: '封存按顺序排列的 Clarify 决策账本前缀。' },
    debt: { code: 'EH-CLARIFY-DEBT-136', action: '记录并验证每项适用的技术债处置。' },
    contract: { code: 'EH-CLARIFY-CONTRACT-137', action: '记录项目长期契约处置；若为 proposal-required，则生成不可变提案、取得用户批准并安全应用。' },
    requirements: { code: 'EH-CLARIFY-REQUIREMENTS-138', action: '批准并持久化当前由证据推导出的需求。' },
    classification: { code: 'EH-CLARIFY-CLASSIFICATION-139', action: '根据当前权威输入重新计算并持久化复杂度分类。' },
    selfCheck: { code: 'EH-CLARIFY-SELF-CHECK-140', action: '发布新鲜且通过的 Clarify StageResult 自检结果。' },
    review: { code: 'EH-CLARIFY-REVIEW-141', action: '发布新鲜、独立且通过的 Clarify ReviewResult。' },
    tecpc: { code: 'EH-CLARIFY-TECPC-142', action: '完成 Clarify TECPC 闭环，且不得留下待处理纠正项。' },
  };
  const assertProgress = (expectedRecovery, expectedStatuses) => {
    const projected = buildClarifyReadiness(root, progressiveId);
    assert.deepEqual(projected.recovery, expectedRecovery, JSON.stringify(projected.items));
    assert.deepEqual(projected.items.map(({ status }) => status), expectedStatuses);
    assert.equal(projected.items.length, 14);
    assert.equal(projected.transitionReady, expectedRecovery === null);
    const passed = expectedStatuses.filter((status) => status === 'pass').length;
    if (passed < 4) assert.equal(projected.ambiguitySummary.index, null);
    else if (passed === 4) {
      assert.equal(projected.ambiguitySummary.index, 100);
      assert.equal(projected.ambiguitySummary.components[0].minimumDimensionScore, null);
      assert.equal(projected.ambiguitySummary.unresolvedHighRiskCount, null);
      assert.equal(projected.ambiguitySummary.highRiskStatus, 'untracked');
    } else {
      assert.equal(projected.ambiguitySummary.index, 0);
      assert.equal(projected.ambiguitySummary.components[0].minimumDimensionScore, 4);
      assert.equal(projected.ambiguitySummary.unresolvedHighRiskCount, 0);
      assert.equal(projected.ambiguitySummary.highRiskStatus, 'none');
    }
    assert.equal(projected.route, passed < 3 ? 'research' : passed < 6 ? 'decisions' : passed < 14 ? 'completion' : 'transition');
    assert.equal(fs.existsSync(path.join(progressiveDir, 'clarify-readiness.json')), false);
    assert.equal(fs.existsSync(path.join(progressiveDir, 'checklist.json')), false);
    return projected;
  };
  const statusesAfter = (passed) => [
    ...Array(passed).fill('pass'),
    ...Array(CLARIFY_ITEMS.length - passed).fill('blocked'),
  ];
  assertProgress(recovery.lanes, statusesAfter(0));
  writeProgressiveRequirements();
  assertProgress(recovery.research, statusesAfter(1));
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
  writeProgressiveRequirements({ runId: uncertain.run.runId, packetRef: uncertain.packetRef, status: 'complete' });
  assertProgress(recovery.conflicts, statusesAfter(2));
  const clean = researchHandoff([]);
  writeProgressiveRequirements({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none' });
  assertProgress(recovery.topology, statusesAfter(3));
  writeProgressiveRequirements({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true });
  assertProgress(recovery.ambiguity, statusesAfter(4));
  writeProgressiveRequirements({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true, ambiguity: true });
  assertProgress(recovery.question, statusesAfter(5));
  const validAmbiguityRequirements = fs.readFileSync(path.join(root, progressiveRequirementsRef), 'utf-8');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replace(
    '## 未决决策与确认',
    [
      '## Frontier（component × unresolved dimension）',
      '| Priority | Component | Unresolved dimension | Current score | Evidence / known fact | Risk | Next action |',
      '|---:|---|---|---:|---|---|---|',
      '| 1 | runtime | Constraints | 4 | E-CONSTRAINTS-RISK | high | ask |',
      '## 未决决策与确认',
    ].join('\n'),
  ));
  const conflictingRisk = buildClarifyReadiness(root, progressiveId);
  assert.equal(conflictingRisk.ambiguitySummary.highRiskStatus, 'conflict');
  assert.equal(conflictingRisk.ambiguitySummary.unresolvedHighRiskCount, 1);
  assert.equal(conflictingRisk.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements
    .replace('- unresolved high-risk assumption: none', '')
    .replace('- unresolved high-risk decision: none', '')
    .replace(
      '## 未决决策与确认',
    [
      '## Frontier（component × unresolved dimension）',
      '| Priority | Component | Unresolved dimension | Current score | Evidence / known fact | Risk | Next action |',
      '|---:|---|---|---:|---|---|---|',
      '| 1 | runtime | Constraints | 4 | E-CONSTRAINTS-RISK | high | ask |',
      '## 未决决策与确认',
    ].join('\n'),
    ));
  const presentRisk = buildClarifyReadiness(root, progressiveId);
  assert.equal(presentRisk.ambiguitySummary.highRiskStatus, 'present');
  assert.equal(presentRisk.ambiguitySummary.unresolvedHighRiskCount, 1);
  assert.equal(presentRisk.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replace(
    '| runtime | Workflow runtime | active | none | E-GOAL-CONSUMER |',
    [
      '| runtime | Workflow runtime | active | none | E-GOAL-CONSUMER |',
      '| runtime | Workflow runtime | active | none | E-GOAL-CONSUMER |',
    ].join('\n'),
  ));
  const duplicateComponent = buildClarifyReadiness(root, progressiveId);
  assert.equal(duplicateComponent.ambiguitySummary.components.length, 1);
  assert.equal(duplicateComponent.ambiguitySummary.totalPredicates, 11);
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replace(
    '| runtime | Goal | 4 | 4 | consumer,outcome |',
    '| runtime | Goal | 4 | 4 | consumer |',
  ));
  const partialCoverage = buildClarifyReadiness(root, progressiveId);
  assert.equal(partialCoverage.ambiguitySummary.index, 9);
  assert.equal(partialCoverage.ambiguitySummary.coveredPredicates, 10);
  assert.equal(partialCoverage.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replace(
    '| 4 | 4 |',
    '| 4 |  |',
  ));
  const emptyScore = buildClarifyReadiness(root, progressiveId);
  assert.equal(emptyScore.ambiguitySummary.components[0].minimumDimensionScore, null);
  assert.equal(emptyScore.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  const duplicate = progressiveEvidence[0];
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replace(
    '## Component × Dimension 评分',
    `| ${duplicate.id} | raw-request | original-request | ${duplicate.claim} | ${duplicate.support} |\n## Component × Dimension 评分`,
  ));
  const invalidLedger = buildClarifyReadiness(root, progressiveId);
  assert.equal(invalidLedger.ambiguitySummary.index, 100);
  assert.equal(invalidLedger.ambiguitySummary.components[0].minimumDimensionScore, null);
  assert.equal(invalidLedger.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  fs.writeFileSync(path.join(root, progressiveRequirementsRef), validAmbiguityRequirements.replaceAll('| 4 | 4 |', '| 4 | 6 |'));
  const outOfRangeScore = buildClarifyReadiness(root, progressiveId);
  assert.equal(outOfRangeScore.ambiguitySummary.components[0].minimumDimensionScore, null);
  assert.equal(outOfRangeScore.items.find(({ id }) => id === 'ambiguity-threshold-met').status, 'blocked');
  writeProgressiveRequirements({ runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none', topology: true, ambiguity: true });
  assertProgress(recovery.question, statusesAfter(5));
  fs.writeFileSync(pendingPath, JSON.stringify({ status: 'resolved' }));
  writeProgressiveRequirements({
    runId: clean.run.runId, packetRef: clean.packetRef, status: 'complete', remaining: 'none',
    topology: true, ambiguity: true, approved: true,
  });
  assertProgress(recovery.decisions, statusesAfter(6));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Progressive fixture instructions\n');
  appendDecisionEvent(root, progressiveId, {
    eventVersion: 1, type: 'decision-event', eventId: 'progressive-scope', changeId: progressiveId, stage: 'clarify',
    actor: { type: 'user', id: 'test-user' }, decisionType: 'scope-confirmation',
    targetRef: `${progressiveRequirementsRef}#sha256=${sha256Artifact(root, progressiveRequirementsRef)}`,
    questionId: 'progressive-question', options: ['confirm', 'revise'], recommendedOption: 'confirm', selectedOption: 'confirm',
    publicRationale: 'Scope confirmed.', evidenceRefs: [progressiveRequirementsRef],
    inputDigests: { [progressiveRequirementsRef]: sha256Artifact(root, progressiveRequirementsRef) },
    recordedAt: '2026-08-25T00:00:00.000Z',
  });
  sealClarifyDecisionSnapshot(root, progressiveId, readDecisionEvents(root, progressiveId).map(({ eventId }) => eventId));
  const afterScope = statusesAfter(7);
  afterScope[9] = 'pass';
  assertProgress(recovery.debt, afterScope);
  writeDebtAssessment(root, progressiveId, {
    assessmentVersion: 1, type: 'debt-assessment', changeId: progressiveId, observations: [], dispositions: [],
    inputDigests: { 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') }, updatedAt: '2026-08-25T00:01:00.000Z',
  });
  const afterDebt = statusesAfter(8);
  afterDebt[9] = 'pass';
  assertProgress(recovery.contract, afterDebt);
  writeProjectContractAssessment(root, progressiveId, {
    assessmentVersion: 1, type: 'project-contract-assessment', changeId: progressiveId,
    files: [{ path: 'CLAUDE.md', digest: sha256Artifact(root, 'CLAUDE.md'), scope: 'project', ownership: 'project' }],
    gaps: [], conflicts: [], status: 'use-existing', decisionEventId: null, proposalRef: null,
    inputDigests: { 'CLAUDE.md': sha256Artifact(root, 'CLAUDE.md') }, updatedAt: '2026-08-25T00:02:00.000Z',
  });
  assertProgress(recovery.classification, statusesAfter(10));
  const progressiveClassification = writeClassificationV2Fixture(root, progressiveId, { tier: 'L1' }, 'progressive');
  fs.writeFileSync(path.join(progressiveDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 6, revision: 1, changeId: progressiveId, lifecycle: 'active', stage: 'clarify',
    artifacts: { classification: progressiveClassification }, validation: { status: 'missing', digest: null, validatedAt: null },
  }, null, 2)}\n`);
  assertProgress(recovery.selfCheck, statusesAfter(11));
  addClarifyCompletion(root, progressiveId, { stageStatus: 'block' });
  assertProgress(recovery.selfCheck, statusesAfter(11));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const untrustedCompletion = addClarifyCompletion(root, progressiveId, { reviewerTrusted: false, tecpcCorrection: 'Resolve correction.' });
  assertProgress(recovery.review, statusesAfter(12));
  appendCompletedHandoffBinding(root, progressiveId, untrustedCompletion.check.input, { agentId: 'progressive-reviewer' });
  assertProgress(recovery.tecpc, statusesAfter(13));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const completeProgression = addClarifyCompletion(root, progressiveId);
  assertProgress(null, statusesAfter(14));
  const unboundResearchTecpc = {
    ...completeProgression.stageResult.tecpc,
    evidence: completeProgression.stageResult.tecpc.evidence.filter((reference) => reference !== clean.packetRef),
    context: completeProgression.stageResult.tecpc.context.filter((reference) => reference !== clean.packetRef),
  };
  fs.writeFileSync(v2ResultPath(root, progressiveId, completeProgression.execute.runId), `${JSON.stringify({
    ...completeProgression.stageResult,
    tecpc: unboundResearchTecpc,
  }, null, 2)}\n`);
  fs.writeFileSync(v2ResultPath(root, progressiveId, completeProgression.check.runId, 'check'), `${JSON.stringify({
    ...completeProgression.review,
    tecpc: unboundResearchTecpc,
  }, null, 2)}\n`);
  const unboundCandidate = resolveStageCompletionCandidate(root, progressiveId, 'clarify');
  assert.equal(unboundCandidate.proof, null);
  assert.match(unboundCandidate.problems.join('; '), /Clarify proof assertion evidence is unbound/u);
  const unboundStatus = spawnSync(process.execPath, [workflow, 'status', progressiveId, '--json'], {
    cwd: root, encoding: 'utf-8', shell: false,
  });
  assert.equal(unboundStatus.status, 0, unboundStatus.stderr);
  const unboundWorkflow = JSON.parse(unboundStatus.stdout);
  const unboundProjection = unboundWorkflow.clarifyReadiness;
  assert.equal(unboundProjection.status, 'blocked', 'candidate-proof derivation failure must not report ready');
  assert.equal(unboundProjection.transitionReady, false);
  assert.equal(unboundProjection.items.find(({ id }) => id === 'tecpc-complete').status, 'blocked');
  assert.equal(unboundProjection.items.filter(({ status }) => status === 'pass').length, 13);
  assert.equal(unboundProjection.recovery.code, 'EH-CLARIFY-TECPC-142');
  assert.deepEqual(controllerRoutesFromWorkflowStatus(unboundWorkflow), ['C']);
  fs.writeFileSync(v2ResultPath(root, progressiveId, completeProgression.execute.runId), `${JSON.stringify(completeProgression.stageResult, null, 2)}\n`);
  fs.writeFileSync(v2ResultPath(root, progressiveId, completeProgression.check.runId, 'check'), `${JSON.stringify(completeProgression.review, null, 2)}\n`);
  assertProgress(null, statusesAfter(14));
  const progressiveProof = (await import('../core/completion-proof.mjs')).buildCompletionProof(root, {
    stageResult: completeProgression.stageResult,
    reviewResult: completeProgression.review,
    producerAgentIds: ['enterprise-harness:main'],
    reviewerAgentIds: [`${progressiveId}-reviewer`],
    createdAt: '2026-08-25T02:00:00.000Z',
  });
  const proofPath = path.join(progressiveDir, 'evidence', 'completion', 'clarify.json');
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify({ ...progressiveProof, target: 'generic proof' }, null, 2)}\n`);
  assertProgress(null, statusesAfter(14));
  fs.writeFileSync(proofPath, `${JSON.stringify(progressiveProof, null, 2)}\n`);
  assertProgress(null, statusesAfter(14));

  const completionCases = [
    ['blocked-stage', { stageStatus: 'block' }, 'self-check-passed', 'EH-CLARIFY-SELF-CHECK-140'],
    ['untrusted-reviewer', { reviewerTrusted: false }, 'independent-review-passed', 'EH-CLARIFY-REVIEW-141'],
    ['mismatched-reviewer', { reviewerMatches: false }, 'independent-review-passed', 'EH-CLARIFY-REVIEW-141'],
    ['pending-tecpc', { tecpcCorrection: 'Resolve remaining correction.' }, 'tecpc-complete', 'EH-CLARIFY-TECPC-142'],
    ['forged-review-run', { forgedReviewRunId: true, proof: 'valid' }, 'independent-review-passed', 'EH-CLARIFY-REVIEW-141'],
  ];
  for (const [suffix, options, itemId, recoveryCode] of completionCases) {
    const candidateId = `readiness-${suffix}`;
    prepareClassifiedClarify(root, candidateId);
    addClarifyCompletion(root, candidateId, options);
    const candidate = buildClarifyReadiness(root, candidateId);
    assert.equal(candidate.items.find(({ id }) => id === itemId).status, recoveryCode ? 'blocked' : 'pass', suffix);
    assert.equal(candidate.recovery?.code ?? null, recoveryCode, suffix);
    if (suffix === 'forged-review-run') {
      assert.equal(stageCompletionFor(root, candidateId, 'clarify').review.status, 'blocked');
    }
  }
  for (const [suffix, proof] of [['missing-proof', 'missing'], ['mismatched-proof', 'mismatched'], ['valid-proof', 'valid']]) {
    const candidateId = `readiness-${suffix}`;
    prepareClassifiedClarify(root, candidateId);
    addClarifyCompletion(root, candidateId, { proof });
    const candidate = buildClarifyReadiness(root, candidateId);
    assert.equal(candidate.status, 'ready', suffix);
    assert.equal(candidate.transitionReady, true, suffix);
    assert.equal(candidate.recovery, null, suffix);
    assert.equal(candidate.items.some(({ id }) => id === 'clarify-proof-fresh'), false, suffix);
  }

  console.log(`PASS clarify-readiness ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
