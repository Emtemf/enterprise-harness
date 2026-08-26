import fs from 'node:fs';
import path from 'node:path';
import { readDebtAssessment, readProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { readClassificationArtifact } from '../core/classification-artifact.mjs';
import { readClarifyDecisionSnapshot } from '../core/decision-ledger.mjs';
import { pendingQuestionPath } from '../core/clarify-question.mjs';
import { readClarifyResearchEvidence } from './clarify-research-evidence.mjs';
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
  researchLanes: { code: 'EH-CLARIFY-RESEARCH-LANES-144', action: 'Decide applicability for both code and docs research lanes.' },
  research: { code: 'EH-CLARIFY-RESEARCH-131', action: 'Complete and persist every required ResearchPacket.' },
  researchConflicts: { code: 'EH-CLARIFY-RESEARCH-CONFLICTS-145', action: 'Dispose degraded research, conflicts, and remaining fact uncertainty.' },
  topology: { code: 'EH-CLARIFY-TOPOLOGY-132', action: 'Confirm the evidence-derived component topology.' },
  ambiguity: { code: 'EH-CLARIFY-AMBIGUITY-133', action: 'Resolve the weakest evidence-bound ambiguity and recompute requirements.' },
  question: { code: 'EH-CLARIFY-QUESTION-134', action: 'Resolve the one authorized pending Clarify question.' },
  decisions: { code: 'EH-CLARIFY-DECISIONS-135', action: 'Seal the ordered Clarify decision-ledger prefix.' },
  debt: { code: 'EH-CLARIFY-DEBT-136', action: 'Record and validate every applicable technical-debt disposition.' },
  contract: { code: 'EH-CLARIFY-CONTRACT-137', action: 'Record and validate the project-contract disposition.' },
  requirements: { code: 'EH-CLARIFY-REQUIREMENTS-138', action: 'Approve and persist the current evidence-derived requirements.' },
  classification: { code: 'EH-CLARIFY-CLASSIFICATION-139', action: 'Recompute and persist classification from current authoritative inputs.' },
  selfCheck: { code: 'EH-CLARIFY-SELF-CHECK-140', action: 'Publish a fresh passing Clarify StageResult self-check.' },
  review: { code: 'EH-CLARIFY-REVIEW-141', action: 'Publish a fresh independent passing Clarify ReviewResult.' },
  tecpc: { code: 'EH-CLARIFY-TECPC-142', action: 'Complete the Clarify TECPC envelope without a pending correction.' },
});

const CORE_DIMENSIONS = ['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'];

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

function requirementsPredicates(content) {
  const topologySection = section(content, '## 组件拓扑');
  const active = tableRows(topologySection).filter((cells) => cells[0] !== 'Component' && cells[2]?.toLowerCase() === 'active').map((cells) => cells[0]);
  const scoreRows = tableRows(section(content, '## Component × Dimension 评分')).filter((cells) => cells[0] !== 'Component');
  const scoresReady = active.length > 0 && active.every((component) => CORE_DIMENSIONS.every((dimension) => {
    const matches = scoreRows.filter((cells) => cells[0] === component && cells[1] === dimension);
    return matches.length === 1 && Number.isInteger(Number(matches[0][3])) && Number(matches[0][3]) >= 4;
  }));
  return {
    topology: active.length > 0 && /[-*]\s*topology confirmed\s*[:：]\s*true\b/iu.test(topologySection),
    ambiguity: scoresReady
      && /[-*]\s*unresolved high-risk assumption\s*[:：]\s*none\b/iu.test(section(content, '## Component × Dimension 评分'))
      && /[-*]\s*unresolved high-risk decision\s*[:：]\s*none\b/iu.test(section(content, '## 未决决策与确认')),
    approved: /[-*]\s*scope confirmed\s*[:：]\s*true\b/iu.test(section(content, '## 未决决策与确认')),
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

  const predicates = requirementsPredicates(requirements.content);
  items.push(immutableItem('topology-confirmed', predicates.topology ? 'pass' : 'blocked', predicates.topology ? [requirements.ref] : [], RECOVERIES.topology));
  items.push(immutableItem('ambiguity-threshold-met', predicates.ambiguity ? 'pass' : 'blocked', predicates.ambiguity ? [requirements.ref] : [], RECOVERIES.ambiguity));
  try {
    const pending = pendingStatus(root, changeId);
    items.push(immutableItem('no-pending-question', pending.ok ? 'pass' : 'blocked', pending.refs, RECOVERIES.question));
  } catch (error) {
    items.push(immutableItem('no-pending-question', statusFor(error), [], RECOVERIES.question));
  }

  try {
    const snapshot = readClarifyDecisionSnapshot(root, changeId);
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
    readProjectContractAssessment(root, changeId);
    items.push(immutableItem('project-contract-disposed', 'pass', [`harness/changes/${changeId}/project-contract-assessment.json`], RECOVERIES.contract));
  } catch (error) {
    items.push(immutableItem('project-contract-disposed', statusFor(error), [], RECOVERIES.contract));
  }
  items.push(immutableItem('requirements-approved', predicates.approved ? 'pass' : 'blocked', predicates.approved ? [requirements.ref] : [], RECOVERIES.requirements));

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
    recovery: first ? { code: first.code, action: first.action } : null,
  });
}
