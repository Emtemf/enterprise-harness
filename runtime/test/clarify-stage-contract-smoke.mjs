import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHandoffV2, persistHandoffV2Result, v2ResultPath } from '../core/handoff-v2.mjs';
import { writeClassificationV2Fixture as writeClassificationArtifact } from './classification-v2-fixture.mjs';
import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { sha256Artifact } from '../lib/result-contract.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const finalize = path.join(sourceRoot, 'skills', 'harness', 'scripts', 'finalize-clarify-result.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-clarify-stage-'));
const changeId = 'clarify-slice';
const changeDir = path.join(root, 'harness', 'changes', changeId);
const requirementsRef = `harness/changes/${changeId}/requirements.md`;
const classificationRef = `harness/changes/${changeId}/classification.json`;
const debtRef = `harness/changes/${changeId}/debt-assessment.json`;
const contractRef = `harness/changes/${changeId}/project-contract-assessment.json`;
const decisionSnapshotRef = `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`;
const requiredClarifyArtifacts = [
  requirementsRef,
  classificationRef,
  debtRef,
  contractRef,
  decisionSnapshotRef,
];
const requiredClarifyAssertionIds = [
  'research-complete',
  'decisions-durable',
  'technical-debt-disposed',
  'project-contract-disposed',
  'requirements-ready',
  'classification-ready',
  'scope-confirmed',
];
const briefRef = `harness/changes/${changeId}/research/code-brief.md`;
let factEvidence = null;

function requirements(overrides = {}) {
  const score = overrides.score ?? 4;
  const evidenceRefs = overrides.evidenceRefs ?? {
    Goal: 'E-GOAL-C,E-GOAL-O',
    Scope: 'E-SCOPE-I,E-SCOPE-E',
    Constraints: 'E-CONSTRAINT-T,E-CONSTRAINT-R',
    Acceptance: 'E-ACCEPT-S,E-ACCEPT-F,E-ACCEPT-O',
    Context: 'E-CONTEXT-N,E-FACT-1',
  };
  const predicateCoverage = overrides.predicateCoverage ?? {
    Goal: 'consumer,outcome',
    Scope: 'included,excluded',
    Constraints: 'technical,risk',
    Acceptance: 'success,failure,observable',
    Context: 'need,current-state',
  };
  const topologyConfirmed = overrides.topologyConfirmed ?? 'true';
  const scopeConfirmed = overrides.scopeConfirmed ?? 'true';
  const highRisk = overrides.highRisk ?? 'none';
  const gapType = overrides.gapType ?? 'resolved';
  const rawPreamble = overrides.rawPreamble ?? '';
  const factGateComplete = overrides.factGateComplete ?? 'true';
  const factStatus = overrides.factStatus ?? 'complete';
  const remainingFact = overrides.remainingFact ?? 'none';
  const docsReason = overrides.docsReason ?? 'no external dependency';
  const factGate = overrides.includeFactGate === false ? [] : [
    '## 事实探索门禁',
    '| Lane | Required | Brief ref | RunId | Packet ref | Status | Authority / fallback |',
    '|---|---|---|---|---|---|---|',
    `| code | yes | ${briefRef} | ${overrides.factRunId ?? factEvidence.runId} | ${overrides.packetRef ?? factEvidence.packetRef} | ${factStatus} | codegraph-first |`,
    ...(overrides.omitDocs === true ? [] : [`| docs | no | none | none | none | not-required | ${docsReason} |`]),
    `- fact gate complete：${factGateComplete}`,
    `- remaining fact uncertainty：${remainingFact}`,
    '',
  ];
  const decisionClaims = [
    '使用者是订单操作员',
    '目标结果是可恢复的订单取消',
    '范围包含订单服务',
    '范围排除支付流程',
    '技术约束是沿用现有技术栈',
    '风险约束是失败时回滚订单状态',
    '成功标准是返回取消完成状态',
    '失败标准是返回拒绝原因',
    '可观察结果是状态响应',
    '当前需要是提供可恢复的取消能力',
  ];
  const authClaims = [
    '身份来源使用现有账号',
    '凭证由服务端校验',
    '会话是有期限的服务端 Session',
    '失败返回通用错误并限流',
    '找回密码和 MFA 明确不在范围内',
    '成功与失败都必须可观察',
  ];
  const defaultEvidenceRows = [
    `| E-GOAL-C | user-decision | round:1 | ${overrides.userClaim ?? decisionClaims[0]} | order-service:Goal.consumer |`,
    `| E-GOAL-O | user-decision | round:1 | ${decisionClaims[1]} | order-service:Goal.outcome |`,
    `| E-SCOPE-I | user-decision | round:1 | ${decisionClaims[2]} | order-service:Scope.included |`,
    `| E-SCOPE-E | user-decision | round:1 | ${decisionClaims[3]} | order-service:Scope.excluded |`,
    `| E-CONSTRAINT-T | user-decision | round:1 | ${decisionClaims[4]} | order-service:Constraints.technical |`,
    `| E-CONSTRAINT-R | user-decision | round:1 | ${decisionClaims[5]} | order-service:Constraints.risk |`,
    `| E-ACCEPT-S | user-decision | round:1 | ${decisionClaims[6]} | order-service:Acceptance.success |`,
    `| E-ACCEPT-F | user-decision | round:1 | ${decisionClaims[7]} | order-service:Acceptance.failure |`,
    `| E-ACCEPT-O | user-decision | round:1 | ${decisionClaims[8]} | order-service:Acceptance.observable |`,
    `| E-CONTEXT-N | user-decision | round:1 | ${decisionClaims[9]} | order-service:Context.need |`,
    `| E-FACT-1 | research-packet | fact:code | ${overrides.researchClaim ?? 'Cancellation is owned by order-service.'} | order-service:Context.current-state |`,
    ...(overrides.includeAuthSurfaces === true ? authClaims.map((claim, index) => (
      `| E-AUTH-${index + 1} | user-decision | round:1 | ${claim} | auth:${['identity-source', 'credential-authority', 'session-lifecycle', 'failure-abuse', 'recovery-mfa', 'observable-acceptance'][index]} |`
    )) : []),
    ...(overrides.confirmationClaim ? [
      `| E-CONFIRM | user-decision | round:1 | ${overrides.confirmationClaim} | order-service:Goal.confirmed,order-service:Scope.confirmed,order-service:Constraints.confirmed,order-service:Acceptance.confirmed,order-service:Context.confirmed |`,
    ] : []),
  ];
  const evidenceRows = overrides.evidenceRows ?? defaultEvidenceRows;
  const authSurfaceBlock = overrides.includeAuthSurfaces === true ? [
    '- Authentication/identity：适用；依据：E-AUTH-1',
    '### Authentication decision surfaces',
    '| Surface | Applicable | Resolution / rationale | Evidence ref | Status |',
    '|---|---|---|---|---|',
    '| identity-source | yes | existing account identity | E-AUTH-1 | resolved |',
    '| credential-authority | yes | server verifies credentials | E-AUTH-2 | resolved |',
    '| session-lifecycle | yes | bounded server session | E-AUTH-3 | resolved |',
    '| failure-abuse | yes | generic errors and rate limiting | E-AUTH-4 | resolved |',
    '| recovery-mfa | no | explicitly outside this scope | E-AUTH-5 | not-applicable |',
    '| observable-acceptance | yes | success and failure are observable | E-AUTH-6 | resolved |',
  ] : [
    '- Authentication/identity：不适用；依据：需求不涉及身份认证',
  ];
  return [
    '# Requirements（v6 topology / frontier）',
    '',
    '## 目标与验收',
    '### 原始需求',
    rawPreamble,
    '构建可恢复的订单取消流程。',
    '### 澄清后的目标',
    '支持用户取消订单并获得可验证结果。',
    '### 验收',
    '- R1：取消成功时返回可观察结果。',
    '',
    ...factGate,
    '## 组件拓扑',
    '| Component | Outcome / boundary | Status | Depends on | Confirmation source |',
    '|---|---|---|---|---|',
    '| order-service | cancel order | active | none | user |',
    `- topology confirmed：${topologyConfirmed}`,
    '- confirmedAt：2026-08-21T00:00:00.000Z',
    '- 用户确认 / 修正：looks right',
    '',
    '## Evidence ledger',
    '| Evidence ID | Kind | Locator | Claim | Supports |',
    '|---|---|---|---|---|',
    ...evidenceRows,
    '',
    '## Component × Dimension 评分',
    '| Component | Dimension | 上轮分数 | 本轮分数 | Predicate coverage | Evidence refs | Gap / unresolved decision | Gap type | Owner / status |',
    '|---|---|---:|---:|---|---|---|---|---|---|',
    `| order-service | Goal | 3 | ${score} | ${predicateCoverage.Goal ?? ''} | ${typeof evidenceRefs === 'string' ? evidenceRefs : evidenceRefs.Goal} | none | ${gapType} | user / resolved |`,
    `| order-service | Scope | 3 | ${score} | ${predicateCoverage.Scope ?? ''} | ${typeof evidenceRefs === 'string' ? evidenceRefs : evidenceRefs.Scope} | none | ${gapType} | user / resolved |`,
    `| order-service | Constraints | 3 | ${score} | ${predicateCoverage.Constraints ?? ''} | ${typeof evidenceRefs === 'string' ? evidenceRefs : evidenceRefs.Constraints} | none | ${gapType} | user / resolved |`,
    `| order-service | Acceptance | 3 | ${score} | ${predicateCoverage.Acceptance ?? ''} | ${typeof evidenceRefs === 'string' ? evidenceRefs : evidenceRefs.Acceptance} | none | ${gapType} | user / resolved |`,
    `| order-service | Context | 3 | ${score} | ${predicateCoverage.Context ?? ''} | ${typeof evidenceRefs === 'string' ? evidenceRefs : evidenceRefs.Context} | none | ${gapType} | agent / resolved |`,
    '- overall / coverage summary：all critical dimensions >= 4',
    `- unresolved high-risk assumption：${highRisk}`,
    '- 用户确认 / 修正：scores accepted',
    '',
    '## Frontier（component × unresolved dimension）',
    '| Priority | Component | Unresolved dimension | Current score | Evidence / known fact | Risk | Next action |',
    '|---:|---|---|---:|---|---|---|',
    '| 1 | order-service | none | 4 | confirmed | low | resolve |',
    '- weakest / highest-risk frontier：none',
    '- 当前下一问（一次一个）：none',
    '- 推荐选项及理由：none',
    '',
    '## 事实、约束与条件分支',
    '### ResearchPacket',
    '- packet ref：ResearchPacket:order-service',
    '- code/document facts：confirmed',
    '- input digest：recorded',
    '- uncertainty / fallback：none',
    '### 条件分支',
    '- API/Data：不适用；依据：当前需求无接口或数据变更。',
    '- Architecture：适用；依据：服务边界已确认。',
    '- Rule：不适用；依据：无规则变更。',
    '- Security：不适用；依据：无安全边界变更。',
    ...authSurfaceBlock,
    '### 非目标与约束',
    '- 非目标：不改支付流程。',
    '- 兼容性：保持现有调用兼容。',
    '- 性能与运行约束：无新增约束。',
    '- 风险与回滚边界：失败时回滚订单状态。',
    '',
    '## Classification',
    '- tier：L1',
    '- impact：architecture',
    '- owning module / service：order-service',
    '- classification evidence：用户确认',
    '',
    '## 未决决策与确认',
    '| Round | Component × dimension | Type | Question / researched fact | Options / recommendation | Answer / result | Owner / status | Dependency / exception | Score delta | Source |',
    '|---:|---|---|---|---|---|---|---|---|---|',
    '| 0 | topology | Decision | Is this topology right? | yes (recommended) / revise | yes | user / resolved | none | not scored | user |',
    `| 1 | order-service × readiness | ${overrides.roundType ?? 'Decision'} | Confirm cancellation outcome, boundary, constraints, acceptance, and need? | confirm (recommended) / revise | ${overrides.userAnswer ?? [...decisionClaims, ...(overrides.includeAuthSurfaces === true ? authClaims : []), ...(overrides.confirmationClaim ? [overrides.confirmationClaim] : [])].join('；')} | ${overrides.roundOwnerStatus ?? 'user / resolved'} | none | Goal 3→4; Scope 3→4; Constraints 3→4; Acceptance 3→4; Context 3→4 | ${overrides.roundSource ?? 'user'} |`,
    `- unresolved high-risk decision：${highRisk}`,
    `- scope confirmed：${scopeConfirmed}`,
    '- confirmed by：user',
    '- confirmedAt：2026-08-21T00:00:00.000Z',
  ].join('\n');
}

try {
  fs.mkdirSync(changeDir, { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(briefRef)), { recursive: true });
  fs.writeFileSync(path.join(root, briefRef), '# Research Brief\n\nInspect cancellation symbols.\n');
  const research = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [briefRef],
    tecpc: {
      target: 'inspect cancellation symbols',
      evidence: [briefRef],
      context: [briefRef],
      path: 'clarify code facts',
      correction: null,
    },
  });
  persistHandoffV2Result(root, changeId, research.runId, {
    packetVersion: 1,
    type: 'research-packet',
    changeId,
    source: 'code-explore',
    question: 'Which symbols constrain cancellation?',
    scope: ['order-service'],
    facts: [{ claim: 'Cancellation is owned by order-service.', sources: [briefRef] }],
    uncertainties: [],
    authority: 'codegraph-first',
    fallback: null,
    degraded: false,
    recommendedDecision: null,
    inputRefs: [briefRef],
    inputDigests: { [briefRef]: sha256Artifact(root, briefRef) },
    collectedAt: '2026-08-21T00:00:00.000Z',
  });
  factEvidence = {
    runId: research.runId,
    packetRef: path.relative(root, v2ResultPath(root, changeId, research.runId)).split(path.sep).join('/'),
  };
  const factSessionId = 'clarify-fact-session';
  const factAgentId = 'clarify-fact-agent';
  const factToolUseId = 'clarify-fact-tool';
  for (const event of [
    {
      kind: 'dispatch', sessionId: factSessionId, toolUseId: factToolUseId,
      requestedAgentType: research.input.agent.type, runId: research.runId,
      behavior: research.input.behavior, handoffRole: 'execute', parentRunId: null,
    },
    {
      kind: 'start', sessionId: factSessionId, agentId: factAgentId,
      observedAgentType: research.input.agent.type,
    },
    {
      kind: 'stop', sessionId: factSessionId, agentId: factAgentId,
      observedAgentType: research.input.agent.type, runId: research.runId,
      behavior: research.input.behavior, handoffRole: 'execute', parentRunId: null,
    },
    {
      kind: 'dispatch-binding', sessionId: factSessionId, toolUseId: factToolUseId,
      agentId: factAgentId, requestedAgentType: research.input.agent.type,
      runId: research.runId, behavior: research.input.behavior,
      handoffRole: 'execute', parentRunId: null,
    },
  ]) appendAgentEvent(root, changeId, { ...event, cwd: root });
  let classification = null;
  let classificationOrdinal = 0;

  function run(content, afterHandoff = null, options = {}) {
    fs.writeFileSync(path.join(root, requirementsRef), content);
    classificationOrdinal += 1;
    try {
      classification = writeClassificationArtifact(root, changeId, {
        tier: 'L1',
        impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'no', security: 'no' },
        refreshAuthoritative: true,
      }, `refresh-${classificationOrdinal}`);
      fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
        schemaVersion: 6,
        revision: classificationOrdinal,
        changeId,
        lifecycle: 'active',
        stage: 'clarify',
        artifacts: { classification },
        validation: { status: 'missing', digest: null, validatedAt: null },
      }, null, 2)}\n`);
    } catch (error) {
      return { result: { status: 2, stderr: error.message, stdout: '' }, runId: null };
    }
    if (options.beforeHandoff) options.beforeHandoff();
    const excludedInputRefs = new Set(options.excludeInputRefs || []);
    const handoff = createHandoffV2(root, {
      changeId,
      stage: 'clarify',
      behavior: 'clarify.confirmed',
      agent: { type: 'enterprise-harness:main', skill: 'harness' },
      inputRefs: [
        ...requiredClarifyArtifacts,
        ...(options.includeBriefInput === false ? [] : [briefRef]),
        factEvidence.packetRef,
      ].filter((reference) => !excludedInputRefs.has(reference)),
      tecpc: {
        target: 'confirmed requirements and classification',
        evidence: [requirementsRef, classification.path],
        context: [requirementsRef],
        path: `${requirementsRef} -> ${classification.path}`,
        correction: null,
      },
    });
    if (afterHandoff) afterHandoff();
    const result = spawnSync(process.execPath, [finalize, changeId, handoff.runId], {
      cwd: root,
      encoding: 'utf-8',
      shell: false,
    });
    return { result, runId: handoff.runId };
  }

  const passed = run(requirements());
  assert.equal(passed.result.status, 0, passed.result.stderr);
  assert.match(passed.result.stdout, /HANDOFF_RESULT=/u);
  const persisted = JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, passed.runId), 'utf-8'));
  assert.equal(persisted.stage, 'clarify');
  assert.deepEqual(
    persisted.artifacts.map(({ path: artifactPath }) => artifactPath),
    requiredClarifyArtifacts,
    'Clarify StageResult must bind the exact five canonical artifacts',
  );
  assert.deepEqual(
    persisted.assertions.map(({ id }) => id),
    requiredClarifyAssertionIds,
    'Clarify StageResult must publish the seven canonical assertions',
  );
  const boundEvidence = new Set([
    ...persisted.artifacts.map(({ path: artifactPath }) => artifactPath),
    ...Object.keys(persisted.inputDigests),
  ]);
  for (const assertion of persisted.assertions) {
    assert.ok(
      assertion.evidence.every((reference) => boundEvidence.has(reference)),
      `${assertion.id} evidence must be a StageResult artifact or frozen input`,
    );
  }
  assert.ok(
    persisted.assertions.find(({ id }) => id === 'research-complete')?.evidence.includes(factEvidence.packetRef),
    'research-complete must cite the frozen canonical ResearchPacket',
  );

  const missingArtifact = run(requirements(), null, {
    beforeHandoff: () => fs.rmSync(path.join(root, debtRef)),
    excludeInputRefs: [debtRef],
  });
  assert.equal(missingArtifact.result.status, 2, 'missing canonical debt artifact must block finalization');
  assert.match(missingArtifact.result.stderr, /EH-CLARIFY-DEBT-136/u);

  const staleDigest = run(requirements(), () => {
    fs.appendFileSync(path.join(root, debtRef), '\n');
  });
  assert.equal(staleDigest.result.status, 2, 'artifact mutation after handoff must block finalization');
  assert.match(staleDigest.result.stderr, /EH-CLARIFY-FINALIZE-001/u);
  assert.match(staleDigest.result.stderr, /Recreate the Clarify execute handoff/u);

  const undisposedDebt = run(requirements(), null, {
    beforeHandoff: () => {
      const assessment = JSON.parse(fs.readFileSync(path.join(root, debtRef), 'utf-8'));
      assessment.observations = [{
        debtId: 'debt-one',
        claim: 'A relevant debt exists.',
        relevance: 'The change touches it.',
        impact: 'It affects verification.',
        evidenceRefs: [requirementsRef],
      }];
      fs.writeFileSync(path.join(root, debtRef), `${JSON.stringify(assessment, null, 2)}\n`);
    },
  });
  assert.equal(undisposedDebt.result.status, 2, 'undisposed debt must block finalization');
  assert.match(undisposedDebt.result.stderr, /EH-CLARIFY-DEBT-136/u);

  const unresolvedContract = run(requirements(), null, {
    beforeHandoff: () => {
      const assessment = JSON.parse(fs.readFileSync(path.join(root, contractRef), 'utf-8'));
      assessment.status = 'conflict';
      assessment.conflicts = [{ section: 'Clarify', evidence: 'Instructions conflict with the requested scope.' }];
      fs.writeFileSync(path.join(root, contractRef), `${JSON.stringify(assessment, null, 2)}\n`);
    },
  });
  assert.equal(unresolvedContract.result.status, 2, 'unresolved project-contract conflict must block finalization');
  assert.match(unresolvedContract.result.stderr, /EH-CLARIFY-CONTRACT-137/u);

  const unsealedDecision = run(requirements(), null, {
    beforeHandoff: () => fs.rmSync(path.join(root, decisionSnapshotRef)),
    excludeInputRefs: [decisionSnapshotRef],
  });
  assert.equal(unsealedDecision.result.status, 2, 'missing immutable decision snapshot must block finalization');
  assert.match(unsealedDecision.result.stderr, /EH-CLARIFY-DECISIONS-135/u);

  const mismatchedClassificationInput = run(requirements(), null, {
    beforeHandoff: () => {
      const assessment = JSON.parse(fs.readFileSync(path.join(root, debtRef), 'utf-8'));
      assessment.updatedAt = '2026-08-25T00:01:01.000Z';
      fs.writeFileSync(path.join(root, debtRef), `${JSON.stringify(assessment, null, 2)}\n`);
    },
  });
  assert.equal(mismatchedClassificationInput.result.status, 2, 'classification with a changed authoritative input must block finalization');
  assert.match(mismatchedClassificationInput.result.stderr, /EH-CLARIFY-CLASSIFICATION-139/u);

  const unsupportedFive = run(requirements({
    score: 5,
    predicateCoverage: {},
    evidenceRefs: 'E-RAW-1',
    rawPreamble: '想做个简单的登陆',
  }));
  assert.notEqual(unsupportedFive.result.status, 0, 'a vague raw request must not justify five-point readiness');
  assert.match(unsupportedFive.result.stderr, /predicate coverage/u);

  const loginWithoutDecisionSurfaces = run(requirements({ rawPreamble: '想做个简单的登陆' }));
  assert.notEqual(loginWithoutDecisionSurfaces.result.status, 0, 'authentication work must cover its risk decision surfaces');
  assert.match(loginWithoutDecisionSurfaces.result.stderr, /authentication decision surfaces/u);

  const loginWithDecisionSurfaces = run(requirements({
    rawPreamble: '想做个简单的登陆',
    includeAuthSurfaces: true,
  }));
  assert.equal(loginWithDecisionSurfaces.result.status, 0, loginWithDecisionSurfaces.result.stderr);

  const forgedSupports = [
    'order-service:Goal.consumer', 'order-service:Goal.outcome', 'order-service:Goal.confirmed',
    'order-service:Scope.included', 'order-service:Scope.excluded', 'order-service:Scope.confirmed',
    'order-service:Constraints.technical', 'order-service:Constraints.risk', 'order-service:Constraints.confirmed',
    'order-service:Acceptance.success', 'order-service:Acceptance.failure', 'order-service:Acceptance.observable',
    'order-service:Acceptance.confirmed', 'order-service:Context.need', 'order-service:Context.current-state',
    'order-service:Context.confirmed',
    'auth:identity-source', 'auth:credential-authority', 'auth:session-lifecycle',
    'auth:failure-abuse', 'auth:recovery-mfa', 'auth:observable-acceptance',
  ].join(',');
  let forgedVagueLogin = requirements({
    rawPreamble: '想做个简单的登录',
    includeAuthSurfaces: true,
    score: 5,
    predicateCoverage: {
      Goal: 'consumer,outcome,confirmed',
      Scope: 'included,excluded,confirmed',
      Constraints: 'technical,risk,confirmed',
      Acceptance: 'success,failure,observable,confirmed',
      Context: 'need,current-state,confirmed',
    },
    evidenceRefs: 'E-RAW-FORGE',
    evidenceRows: [`| E-RAW-FORGE | raw-request | original | 登录 | ${forgedSupports} |`],
  });
  forgedVagueLogin = forgedVagueLogin.replace(/E-AUTH-[1-6]/gu, 'E-RAW-FORGE');
  const forgedVagueResult = run(forgedVagueLogin);
  assert.notEqual(forgedVagueResult.result.status, 0, 'one vague login phrase must not self-certify every readiness predicate');
  assert.match(forgedVagueResult.result.stderr, /exactly one readiness|explicit raw request/u);

  const duplicatedClause = requirements().replace(
    '| E-GOAL-O | user-decision | round:1 | 目标结果是可恢复的订单取消 |',
    '| E-GOAL-O | user-decision | round:1 | 使用者是订单操作员 |',
  );
  const duplicatedClauseResult = run(duplicatedClause);
  assert.notEqual(duplicatedClauseResult.result.status, 0, 'one source clause must not be copied into multiple single-target evidence rows');
  assert.match(duplicatedClauseResult.result.stderr, /reuses a source clause/u);

  const aliasedRawClause = requirements()
    .replace(
      '| E-GOAL-C | user-decision | round:1 | 使用者是订单操作员 |',
      '| E-GOAL-C | raw-request | raw:1 | 构建可恢复的订单取消流程 |',
    )
    .replace(
      '| E-GOAL-O | user-decision | round:1 | 目标结果是可恢复的订单取消 |',
      '| E-GOAL-O | raw-request | raw:2 | 构建可恢复的订单取消流程 |',
    );
  const aliasedRawResult = run(aliasedRawClause);
  assert.notEqual(aliasedRawResult.result.status, 0, 'raw locator aliases must not permit one clause to support multiple targets');
  assert.match(aliasedRawResult.result.stderr, /raw-request locator must be original-request|reuses a source clause/u);

  const confirmedRefs = {
    Goal: 'E-GOAL-C,E-GOAL-O,E-CONFIRM',
    Scope: 'E-SCOPE-I,E-SCOPE-E,E-CONFIRM',
    Constraints: 'E-CONSTRAINT-T,E-CONSTRAINT-R,E-CONFIRM',
    Acceptance: 'E-ACCEPT-S,E-ACCEPT-F,E-ACCEPT-O,E-CONFIRM',
    Context: 'E-CONTEXT-N,E-FACT-1,E-CONFIRM',
  };
  for (const confirmationClaim of [
    'do not proceed and do not confirm this scope',
    'cannot proceed',
    "can't approve this",
    'not ready to proceed',
    'I confirm nothing',
    'I approve nothing',
    'I confirm this only as a draft',
    'Confirmed: this is wrong',
    '授权范围',
    '授权需求',
    '已授权范围',
    '明确授权范围',
    '无法确认范围',
    '并未同意当前需求',
  ]) {
    const negatedConfirmation = run(requirements({
      score: 5,
      predicateCoverage: {
        Goal: 'consumer,outcome,confirmed', Scope: 'included,excluded,confirmed',
        Constraints: 'technical,risk,confirmed', Acceptance: 'success,failure,observable,confirmed',
        Context: 'need,current-state,confirmed',
      },
      evidenceRefs: confirmedRefs,
      confirmationClaim,
    }));
    assert.notEqual(negatedConfirmation.result.status, 0, `${confirmationClaim} must not authorize score 5`);
    assert.match(negatedConfirmation.result.stderr, /explicit raw request or resolved user Decision confirmation/u);
  }
  const affirmativeConfirmation = run(requirements({
    score: 5,
    predicateCoverage: {
      Goal: 'consumer,outcome,confirmed', Scope: 'included,excluded,confirmed',
      Constraints: 'technical,risk,confirmed', Acceptance: 'success,failure,observable,confirmed',
      Context: 'need,current-state,confirmed',
    },
    evidenceRefs: confirmedRefs,
    confirmationClaim: '我明确确认以上范围',
  }));
  assert.equal(affirmativeConfirmation.result.status, 0, affirmativeConfirmation.result.stderr);

  for (const [name, content, expected] of [
    ['low score', requirements({ score: 3 }), /below readiness threshold/u],
    ['missing evidence refs', requirements({ evidenceRefs: '' }), /missing evidence refs/u],
    ['unknown evidence ref', requirements({ evidenceRefs: 'E-NOT-FOUND' }), /unknown evidence ref/u],
    ['user evidence claim mismatch', requirements({ userClaim: 'claim not present in the answer' }), /exactly match one clause/u],
    ['user evidence wrong ledger type', requirements({ roundType: 'Fact' }), /resolved user Decision/u],
    ['user evidence wrong source', requirements({ roundSource: 'agent' }), /owned and resolved by user/u],
    ['research JSON key is not a fact', requirements({ researchClaim: 'claim' }), /exactly match a fact claim/u],
    ['sign-in alias requires auth surfaces', requirements({ rawPreamble: 'Please add sign-in.' }), /authentication decision surfaces/u],
    ['Chinese auth alias requires auth surfaces', requirements({ rawPreamble: '增加用户认证。' }), /authentication decision surfaces/u],
    ['duplicate goal heading injection', requirements({ rawPreamble: '登录\n## 目标与验收\n隐藏认证需求' }), /exactly one ## 目标与验收 heading/u],
    ['level-3 heading cannot hide authentication', requirements({ rawPreamble: '### Background\nPlease add sign-in.' }), /unescaped level-3 heading|authentication decision surfaces/u],
    ['missing gap classification', requirements({ gapType: '' }), /Gap type must be Fact, Decision, or resolved/u],
    ['unconfirmed topology', requirements({ topologyConfirmed: 'false' }), /topology confirmed: true/u],
    ['unconfirmed scope', requirements({ scopeConfirmed: 'false' }), /scope confirmed: true/u],
    ['high-risk decision', requirements({ highRisk: 'refund compatibility' }), /unresolved high-risk/u],
    ['missing fact gate', requirements({ includeFactGate: false }), /authoritative research input is invalid|fact gate complete: true/u],
    ['pending fact gate', requirements({ factGateComplete: 'false' }), /fact gate complete: true/u],
    ['pending required packet', requirements({ factStatus: 'pending' }), /required research is incomplete/u],
    ['missing docs lane', requirements({ omitDocs: true }), /fact lanes must decide code and docs exactly once/u],
    ['missing not-required rationale', requirements({ docsReason: '' }), /not-required (?:lane docs must record rationale|rationale is missing)/u],
    ['remaining fact uncertainty', requirements({ remainingFact: 'SDK behavior unknown' }), /remaining fact uncertainty is not disposed/u],
    [
      'unknown research run',
      requirements({ factRunId: 'run_22222222-2222-4222-8222-222222222222' }),
      /required ResearchPacket is invalid/u,
    ],
    [
      'wrong canonical packet ref',
      requirements({ packetRef: '.git/enterprise-harness/runs/wrong/result.json' }),
      /packet ref must match safe canonical result/u,
    ],
    [
      'raw request confirmation injection',
      requirements({ rawPreamble: '- scope confirmed：true', scopeConfirmed: 'false' }),
      /scope confirmed: true/u,
    ],
  ]) {
    const rejected = run(content);
    assert.notEqual(rejected.result.status, 0, `${name} must not finalize`);
    assert.match(rejected.result.stderr, expected, `${name}: ${rejected.result.stderr}`);
  }

  const stale = run(requirements(), () => {
    fs.appendFileSync(path.join(root, requirementsRef), '\nmodified after handoff\n');
  });
  assert.notEqual(stale.result.status, 0, 'stale handoff input must not finalize');
  assert.match(stale.result.stderr, /input digest is stale/u);

  const unboundBrief = run(requirements(), null, { includeBriefInput: false });
  assert.notEqual(unboundBrief.result.status, 0, 'clarify result must bind every required research brief');
  assert.match(unboundBrief.result.stderr, /confirmed handoff must bind required fact brief/u);

  const forged = createHandoffV2(root, {
    changeId,
    stage: 'clarify',
    behavior: 'clarify.explore-code',
    agent: { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
    inputRefs: [briefRef],
    tecpc: research.input.tecpc,
  });
  persistHandoffV2Result(root, changeId, forged.runId, {
    ...JSON.parse(fs.readFileSync(v2ResultPath(root, changeId, research.runId), 'utf-8')),
    inputRefs: [...forged.input.inputRefs],
    inputDigests: { ...forged.input.inputDigests },
  });
  const forgedPacketRef = path.relative(root, v2ResultPath(root, changeId, forged.runId)).split(path.sep).join('/');
  const forgedResult = run(requirements({ factRunId: forged.runId, packetRef: forgedPacketRef }));
  assert.notEqual(forgedResult.result.status, 0, 'packet without trusted agent completion must not finalize');
  assert.match(forgedResult.result.stderr, /no unique trusted completed agent binding/u);

  const packetPath = v2ResultPath(root, changeId, research.runId);
  const degradedPacket = JSON.parse(fs.readFileSync(packetPath, 'utf-8'));
  degradedPacket.degraded = true;
  degradedPacket.fallback = 'Context unavailable';
  degradedPacket.uncertainties = ['Call-chain impact remains unknown'];
  fs.writeFileSync(packetPath, `${JSON.stringify(degradedPacket, null, 2)}\n`);
  const degradedResult = run(requirements());
  assert.notEqual(degradedResult.result.status, 0, 'degraded packet with uncertainty must not close fact gate');
  assert.match(degradedResult.result.stderr, /research packet is degraded|research packet uncertainties remain/u);

  console.log(`PASS clarify-stage-contract ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
