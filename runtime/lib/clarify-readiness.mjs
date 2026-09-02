import fs from 'node:fs';
import path from 'node:path';
import { readDebtAssessment, readProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { readClassificationArtifact } from '../core/classification-artifact.mjs';
import { readClarifyDecisionSnapshot, readDecisionEvents } from '../core/decision-ledger.mjs';
import { pendingQuestionPath } from '../core/clarify-question.mjs';
import { readClarifyResearchEvidence } from './clarify-research-evidence.mjs';
import { sha256Artifact } from './result-contract.mjs';
import { stageCompletionFor } from './stage-results.mjs';
import { assertNoSymlinkComponents, assertSafeId, resolveWithin } from './safe-paths.mjs';

export const CLARIFY_ITEMS = Object.freeze([
  'research-lanes-decided',
  'required-research-fresh',
  'research-conflicts-disposed',
  'topology-confirmed',
  'ambiguity-threshold-met',
  'no-pending-question',
  'decisions-sealed',
  'technical-debt-disposed',
  'project-contract-disposed',
  'requirements-approved',
  'classification-fresh',
  'self-check-passed',
  'independent-review-passed',
  'tecpc-complete',
]);

const RECOVERIES = Object.freeze({
  researchLanes: { code: 'EH-CLARIFY-RESEARCH-LANES-144', action: '判定代码与外部文档两条研究通道是否适用。' },
  research: { code: 'EH-CLARIFY-RESEARCH-131', action: '完成并持久化每个必需的 ResearchPacket。' },
  researchConflicts: { code: 'EH-CLARIFY-RESEARCH-CONFLICTS-145', action: '处置降级研究、证据冲突和剩余事实不确定性。' },
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
});

const CORE_DIMENSIONS = ['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'];
const READINESS_PREDICATES = Object.freeze({
  Goal: ['consumer', 'outcome'],
  Scope: ['included', 'excluded'],
  Constraints: ['technical', 'risk'],
  Acceptance: ['success', 'failure', 'observable'],
  Context: ['need', 'current-state'],
});

export function selectClarifyControllerRoute(items, transitionReady) {
  if (!Array.isArray(items) || items.length !== CLARIFY_ITEMS.length) {
    throw new Error('EH-CLARIFY-ROUTE-148: Clarify readiness items are incomplete');
  }
  const byId = new Map(items.map((item) => [item?.id, item?.status]));
  const validStatuses = new Set(['pass', 'not-applicable', 'blocked', 'stale']);
  if (byId.size !== CLARIFY_ITEMS.length
    || !CLARIFY_ITEMS.every((id) => byId.has(id))
    || ![...byId.values()].every((status) => validStatuses.has(status))) {
    throw new Error('EH-CLARIFY-ROUTE-148: Clarify readiness items are invalid');
  }
  const passing = (id) => ['pass', 'not-applicable'].includes(byId.get(id));
  if (!['research-lanes-decided', 'required-research-fresh', 'research-conflicts-disposed'].every(passing)) {
    return 'research';
  }
  if (!['topology-confirmed', 'ambiguity-threshold-met', 'no-pending-question'].every(passing)) {
    return 'decisions';
  }
  return transitionReady && CLARIFY_ITEMS.every(passing) ? 'transition' : 'completion';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function splitMarkdownRow(line) {
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of line.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') escaped = true;
    else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += character;
  }
  cells.push(cell.trim());
  return cells;
}

function section(content, heading, nextHeading = '\n## ') {
  const start = content.indexOf(heading);
  if (start < 0) return '';
  const rest = content.slice(start + heading.length);
  const end = rest.indexOf(nextHeading);
  return end < 0 ? rest : rest.slice(0, end);
}

function tableRows(content) {
  return content.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map(splitMarkdownRow).filter((cells) => !cells.every((cell) => /^:?-+:?$/u.test(cell)));
}

function normalizedClause(value) {
  return String(value || '').normalize('NFKC').replace(/[。；;.!?！？]+$/gu, '')
    .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

function sourceClauses(value) {
  return new Set(String(value || '').split(/[。；;.!?！？\n]+/u).map(normalizedClause).filter(Boolean));
}

function between(content, startHeading, endHeading) {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) return '';
  return content.slice(start + startHeading.length, end);
}

function immutableItem(id, status, evidenceRefs, recovery) {
  return deepFreeze({ id, status, evidenceRefs: [...new Set(evidenceRefs)], ...recovery });
}

function statusFor(error) {
  return /stale|digest|sealed ledger prefix/u.test(String(error?.message || error)) ? 'stale' : 'blocked';
}

function readRequirements(root, changeId) {
  const ref = `harness/changes/${changeId}/requirements.md`;
  const absolute = resolveWithin(root, ref, 'requirements');
  assertNoSymlinkComponents(root, absolute, 'requirements');
  return { ref, content: fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf-8') : '' };
}

function requirementsPredicates(content, research) {
  const topologySection = section(content, '## 组件拓扑');
  const originalRequest = between(section(content, '## 目标与验收'), '### 原始需求', '### 澄清后的目标');
  const originalClauses = sourceClauses(originalRequest);
  const confirmationSection = section(content, '## 未决决策与确认');
  const roundAnswers = new Map(tableRows(confirmationSection)
    .filter((cells) => cells[0] !== 'Round' && cells[2] === 'Decision'
      && /^user\s*\/\s*resolved$/iu.test(cells[6] || '') && /^user$/iu.test(cells[9] || ''))
    .map((cells) => [String(cells[0]), sourceClauses(cells[5])]));
  const researchClaims = new Map((research?.packets || []).map((packet) => [
    packet.source === 'code-explore' ? 'fact:code' : 'fact:docs',
    new Set(packet.facts.map(({ claim }) => normalizedClause(claim))),
  ]));
  const evidenceRows = tableRows(section(content, '## Evidence ledger'))
    .filter((cells) => cells[0] !== 'Evidence ID');
  const evidence = new Map();
  const provenance = new Set();
  let evidenceValid = evidenceRows.length > 0;
  for (const cells of evidenceRows) {
    if (cells.length !== 5 || cells.some((cell) => !cell.trim())) { evidenceValid = false; continue; }
    const [id, kind, locator, claim, supportsValue] = cells;
    const supports = new Set(supportsValue.split(',').map((item) => item.trim()).filter(Boolean));
    const normalized = normalizedClause(claim);
    const sourceMatches = kind === 'raw-request'
      ? research?.rawRequestAttested === true && locator === 'original-request' && originalClauses.has(normalized)
      : kind === 'user-decision'
        ? Boolean(locator.match(/^round:(\d+)$/u)?.[1]
          && roundAnswers.get(locator.match(/^round:(\d+)$/u)[1])?.has(normalized))
        : kind === 'research-packet'
          ? researchClaims.get(locator)?.has(normalized)
          : false;
    const provenanceKey = `${kind}\u0000${locator}\u0000${normalized}`;
    const supportShapeValid = supports.size === 1
      || ([...supports].every((support) => support.endsWith('.confirmed'))
        && ['raw-request', 'user-decision'].includes(kind));
    if (!id || evidence.has(id) || !supportShapeValid || !sourceMatches || provenance.has(provenanceKey)) {
      evidenceValid = false;
      continue;
    }
    provenance.add(provenanceKey);
    evidence.set(id, { kind, locator, claim, supports });
  }
  const active = [...new Set(tableRows(topologySection)
    .filter((cells) => cells[0] !== 'Component' && cells[2]?.toLowerCase() === 'active'
      && cells.length >= 5 && cells[1]?.trim().length >= 8
      && (evidence.has(cells[4]?.trim())
        || (cells[4]?.trim().toLowerCase() === 'user'
          && [...evidence.values()].some(({ kind }) => kind === 'user-decision'))))
    .map((cells) => cells[0]))];
  const scoreRows = tableRows(section(content, '## Component × Dimension 评分')).filter((cells) => cells[0] !== 'Component');
  const componentSummaries = active.map((component) => {
    let coveredPredicates = 0;
    const dimensionScores = [];
    for (const dimension of CORE_DIMENSIONS) {
      const matches = scoreRows.filter((cells) => cells[0] === component && cells[1] === dimension);
      if (matches.length !== 1 || matches[0].length !== 9) continue;
      const [, , , scoreValue, coverageValue, refsValue] = matches[0];
      const score = scoreValue.trim() === '' ? Number.NaN : Number(scoreValue);
      if (evidenceValid && Number.isInteger(score) && score >= 0 && score <= 5) dimensionScores.push(score);
      const coverage = new Set(coverageValue.split(',').map((item) => item.trim()).filter(Boolean));
      const refs = new Set(refsValue.split(',').map((item) => item.trim()).filter(Boolean));
      coveredPredicates += READINESS_PREDICATES[dimension].filter((predicate) => {
        const support = `${component}:${dimension}.${predicate}`;
        return evidenceValid && coverage.has(predicate)
          && [...refs].some((ref) => evidence.get(ref)?.supports.has(support));
      }).length;
    }
    const highRiskRows = tableRows(section(content, '## Frontier（component × unresolved dimension）'))
      .filter((cells) => cells[0] !== 'Priority' && cells[1] === component && /^high$/iu.test(cells[5] || ''));
    return {
      component,
      coveredPredicates,
      totalPredicates: Object.values(READINESS_PREDICATES).flat().length,
      minimumDimensionScore: dimensionScores.length === CORE_DIMENSIONS.length ? Math.min(...dimensionScores) : null,
      unresolvedHighRiskCount: highRiskRows.length,
    };
  });
  const totalPredicates = componentSummaries.reduce((sum, item) => sum + item.totalPredicates, 0);
  const coveredPredicates = componentSummaries.reduce((sum, item) => sum + item.coveredPredicates, 0);
  const assumptionNone = /[-*]\s*unresolved high-risk assumption\s*[:：]\s*none\b/iu
    .test(section(content, '## Component × Dimension 评分'));
  const decisionNone = /[-*]\s*unresolved high-risk decision\s*[:：]\s*none\b/iu
    .test(section(content, '## 未决决策与确认'));
  const countedHighRisk = componentSummaries.reduce((sum, item) => sum + item.unresolvedHighRiskCount, 0);
  const highRiskStatus = active.length === 0
    ? 'not-applicable'
    : countedHighRisk > 0
      ? (assumptionNone && decisionNone ? 'conflict' : 'present')
      : assumptionNone && decisionNone
        ? 'none'
        : 'untracked';
  const ambiguitySummary = {
    index: totalPredicates === 0 ? null : Math.round(((totalPredicates - coveredPredicates) / totalPredicates) * 100),
    coveredPredicates,
    totalPredicates,
    unresolvedHighRiskCount: highRiskStatus === 'untracked' ? null : countedHighRisk,
    highRiskStatus,
    components: componentSummaries,
  };
  const scoresReady = evidenceValid && active.length > 0 && active.every((component) => CORE_DIMENSIONS.every((dimension) => {
    const matches = scoreRows.filter((cells) => cells[0] === component && cells[1] === dimension);
    if (matches.length !== 1 || matches[0].length !== 9) return false;
    const [, , , scoreValue, coverageValue, refsValue, , gapType, ownerStatus] = matches[0];
    const score = scoreValue.trim() === '' ? Number.NaN : Number(scoreValue);
    const coverage = new Set(coverageValue.split(',').map((item) => item.trim()).filter(Boolean));
    const refs = new Set(refsValue.split(',').map((item) => item.trim()).filter(Boolean));
    if (!Number.isInteger(score) || score < 4 || score > 5 || refs.size === 0
      || !['Fact', 'Decision', 'resolved'].includes(gapType) || !ownerStatus.trim()) return false;
    return READINESS_PREDICATES[dimension].every((predicate) => {
      const support = `${component}:${dimension}.${predicate}`;
      return coverage.has(predicate)
        && [...refs].some((ref) => evidence.get(ref)?.supports.has(support));
    });
  }));
  return {
    topology: active.length > 0 && /[-*]\s*topology confirmed\s*[:：]\s*true\b/iu.test(topologySection),
    ambiguity: scoresReady && highRiskStatus === 'none',
    approved: /[-*]\s*scope confirmed\s*[:：]\s*true\b/iu.test(section(content, '## 未决决策与确认')),
    ambiguitySummary,
  };
}

function pendingStatus(root, changeId) {
  const pendingPath = pendingQuestionPath(root, changeId);
  if (!fs.existsSync(pendingPath)) return { ok: true, refs: [] };
  const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
  const ref = path.relative(root, pendingPath).split(path.sep).join('/');
  if (pending.status === 'resolved') return { ok: true, refs: [ref] };
  return { ok: false, refs: [ref] };
}

export function buildClarifyArtifactReadiness(root, changeId) {
  try {
    assertSafeId(changeId, 'changeId');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  const items = [];
  const requirements = readRequirements(root, changeId);
  const research = readClarifyResearchEvidence(root, changeId, requirements.ref, requirements.content);
  items.push(immutableItem('research-lanes-decided', research.lanesDecided ? 'pass' : 'blocked', research.lanesDecided ? [requirements.ref] : [], RECOVERIES.researchLanes));
  items.push(immutableItem('required-research-fresh', research.fresh ? 'pass' : statusFor(research.packetProblems.join('; ')), research.refs, RECOVERIES.research));
  items.push(immutableItem('research-conflicts-disposed', research.conflictsDisposed ? 'pass' : 'blocked', research.refs, RECOVERIES.researchConflicts));

  const predicates = requirementsPredicates(requirements.content, research);
  items.push(immutableItem('topology-confirmed', predicates.topology ? 'pass' : 'blocked', predicates.topology ? [requirements.ref] : [], RECOVERIES.topology));
  items.push(immutableItem('ambiguity-threshold-met', predicates.ambiguity ? 'pass' : 'blocked', predicates.ambiguity ? [requirements.ref] : [], RECOVERIES.ambiguity));
  try {
    const pending = pendingStatus(root, changeId);
    items.push(immutableItem('no-pending-question', pending.ok ? 'pass' : 'blocked', pending.refs, RECOVERIES.question));
  } catch (error) {
    items.push(immutableItem('no-pending-question', statusFor(error), [], RECOVERIES.question));
  }

  let scopeDecisionFresh = false;
  try {
    const snapshot = readClarifyDecisionSnapshot(root, changeId);
    const requirementsDigest = sha256Artifact(root, requirements.ref);
    const expectedScopeTarget = `${requirements.ref}#sha256=${requirementsDigest}`;
    const sealedIds = new Set(snapshot.eventIds);
    const scopeEvents = readDecisionEvents(root, changeId).filter((event) => (
      sealedIds.has(event.eventId)
      && event.decisionType === 'scope-confirmation'
      && event.targetRef === expectedScopeTarget
      && event.selectedOption === 'confirm'
      && event.inputDigests?.[requirements.ref] === requirementsDigest
    ));
    scopeDecisionFresh = scopeEvents.length === 1;
    items.push(immutableItem('decisions-sealed', 'pass', [snapshot.ledgerRef.path, `harness/changes/${changeId}/evidence/decisions/clarify-decision-snapshot.json`], RECOVERIES.decisions));
  } catch (error) {
    items.push(immutableItem('decisions-sealed', statusFor(error), [], RECOVERIES.decisions));
  }
  try {
    readDebtAssessment(root, changeId);
    items.push(immutableItem('technical-debt-disposed', 'pass', [`harness/changes/${changeId}/debt-assessment.json`], RECOVERIES.debt));
  } catch (error) {
    items.push(immutableItem('technical-debt-disposed', statusFor(error), [], RECOVERIES.debt));
  }
  try {
    const assessment = readProjectContractAssessment(root, changeId);
    items.push(immutableItem(
      'project-contract-disposed',
      assessment.status === 'proposal-required' ? 'blocked' : 'pass',
      [`harness/changes/${changeId}/project-contract-assessment.json`],
      RECOVERIES.contract,
    ));
  } catch (error) {
    items.push(immutableItem('project-contract-disposed', statusFor(error), [], RECOVERIES.contract));
  }
  const requirementsApproved = predicates.approved && scopeDecisionFresh;
  items.push(immutableItem('requirements-approved', requirementsApproved ? 'pass' : 'blocked', requirementsApproved ? [requirements.ref] : [], RECOVERIES.requirements));

  try {
    const classificationRef = `harness/changes/${changeId}/classification.json`;
    const statePath = resolveWithin(root, `harness/changes/${changeId}/state.json`, 'change state');
    const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf-8')) : null;
    const reference = state?.artifacts?.classification;
    if (!reference) throw new Error('State v6 classification artifact reference is missing');
    readClassificationArtifact(root, changeId, reference);
    items.push(immutableItem('classification-fresh', 'pass', [classificationRef], RECOVERIES.classification));
  } catch (error) {
    items.push(immutableItem('classification-fresh', statusFor(error), [], RECOVERIES.classification));
  }

  const first = items.find(({ status }) => !['pass', 'not-applicable'].includes(status));
  return deepFreeze({
    status: first ? 'blocked' : 'ready',
    items,
    ambiguitySummary: predicates.ambiguitySummary,
    recovery: first ? { code: first.code, action: first.action } : null,
  });
}

export function buildClarifyReadiness(root, changeId) {
  const artifactReadiness = buildClarifyArtifactReadiness(root, changeId);
  const items = [...artifactReadiness.items];
  const completion = stageCompletionFor(root, changeId, 'clarify');
  items.push(immutableItem('self-check-passed', completion.selfCheck.status, completion.selfCheck.refs, RECOVERIES.selfCheck));
  items.push(immutableItem('independent-review-passed', completion.review.status, completion.review.refs, RECOVERIES.review));
  items.push(immutableItem('tecpc-complete', completion.tecpc.status, completion.tecpc.refs, RECOVERIES.tecpc));

  const first = items.find(({ status }) => !['pass', 'not-applicable'].includes(status));
  const transitionReady = !first && Boolean(completion.candidateProof);
  const route = selectClarifyControllerRoute(items, transitionReady);
  return deepFreeze({
    status: first ? 'blocked' : 'ready',
    route,
    transitionReady,
    items,
    ambiguitySummary: artifactReadiness.ambiguitySummary,
    recovery: first ? { code: first.code, action: first.action } : null,
  });
}
