import fs from 'node:fs';
import path from 'node:path';
import { readDebtAssessment, readProjectContractAssessment } from '../core/clarify-assessments.mjs';
import { readClassificationArtifact } from '../core/classification-artifact.mjs';
import { readClarifyDecisionSnapshot } from '../core/decision-ledger.mjs';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { pendingQuestionPath } from '../core/clarify-question.mjs';
import { gitCommonDir, trustedHandoffAgentBindings } from './agent-evidence.mjs';
import {
  sha256Artifact,
  validateCompletionProof,
  validateResearchPacket,
  validateReviewResult,
  validateStageResult,
  validateTecpc,
} from './result-contract.mjs';
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
  'clarify-proof-fresh',
]);

const RECOVERIES = Object.freeze({
  research: { code: 'EH-CLARIFY-RESEARCH-131', action: 'Complete and persist every required ResearchPacket.' },
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
  proof: { code: 'EH-CLARIFY-PROOF-143', action: 'Publish the fresh digest-bound ClarifyProof.' },
});

const CORE_DIMENSIONS = ['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function factLanes(content) {
  return tableRows(section(content, '## 事实探索门禁'))
    .filter((cells) => cells[0] !== 'Lane' && ['code', 'docs'].includes(cells[0]));
}

function freshResearch(root, changeId, lanes) {
  const refs = [];
  const packets = [];
  for (const [lane, required, briefRef, runId, packetRef, status] of lanes) {
    if (String(required).toLowerCase() === 'no') {
      if (String(status).toLowerCase() !== 'not-required') throw new Error(`${lane} must be not-required`);
      continue;
    }
    if (String(required).toLowerCase() !== 'yes' || String(status).toLowerCase() !== 'complete') throw new Error(`${lane} required research is incomplete`);
    const input = loadHandoffV2(root, changeId, runId);
    const expectedSource = lane === 'code' ? 'code-explore' : 'doc-research';
    const expectedBehavior = lane === 'code' ? 'clarify.explore-code' : 'clarify.research-docs';
    if (input.stage !== 'clarify' || input.role !== 'execute' || input.behavior !== expectedBehavior || !input.inputRefs.includes(briefRef)) {
      throw new Error(`${lane} research handoff does not match the required lane`);
    }
    const resultPath = v2ResultPath(root, changeId, runId);
    const canonicalRef = path.relative(root, resultPath).split(path.sep).join('/');
    if (packetRef !== canonicalRef || !fs.existsSync(resultPath)) throw new Error(`${lane} ResearchPacket is missing`);
    const packet = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    const problems = validateResearchPacket(root, packet);
    if (problems.length > 0 || packet.changeId !== changeId || packet.source !== expectedSource
        || JSON.stringify(packet.inputRefs) !== JSON.stringify(input.inputRefs)
        || JSON.stringify(packet.inputDigests) !== JSON.stringify(input.inputDigests)) {
      throw new Error(`${lane} ResearchPacket is invalid or stale: ${problems.join('; ')}`);
    }
    const bindings = trustedHandoffAgentBindings(root, changeId, input)
      .filter(({ binding }) => binding !== null);
    if (bindings.length !== 1) throw new Error(`${lane} ResearchPacket has no unique trusted completed agent binding`);
    refs.push(canonicalRef);
    packets.push(packet);
  }
  return { refs, packets };
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

function latestRun(root, changeId, role, parentRunId = null) {
  const dir = path.join(gitCommonDir(root), 'enterprise-harness', 'runs', changeId);
  if (!fs.existsSync(dir)) return null;
  let latest = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const input = loadHandoffV2(root, changeId, entry.name);
      if (input.stage !== 'clarify' || input.role !== role || (input.parentRunId ?? null) !== parentRunId) continue;
      const createdAt = Date.parse(input.createdAt);
      if (!latest || createdAt > latest.createdAt || (createdAt === latest.createdAt && entry.name > latest.input.runId)) latest = { input, createdAt };
    } catch {}
  }
  return latest;
}

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function handoffFreshnessProblems(root, input) {
  const problems = [];
  for (const reference of input.inputRefs || []) {
    try {
      if (sha256Artifact(root, reference) !== input.inputDigests?.[reference]) {
        problems.push(`handoff input digest is stale: ${reference}`);
      }
    } catch (error) {
      problems.push(`handoff input is missing or unreadable: ${reference} (${error.message})`);
    }
  }
  return problems;
}

function completionEvidence(root, changeId) {
  const evidence = { selfCheck: null, review: null, tecpc: null, proof: null };
  const execute = latestRun(root, changeId, 'execute');
  if (!execute) return evidence;
  const stagePath = v2ResultPath(root, changeId, execute.input.runId);
  if (!fs.existsSync(stagePath)) return evidence;
  let stageResult;
  try {
    stageResult = JSON.parse(fs.readFileSync(stagePath, 'utf-8'));
    const problems = [
      ...validateStageResult(root, stageResult),
      ...handoffFreshnessProblems(root, execute.input),
    ];
    if (!sameDigestMap(stageResult.inputDigests, execute.input.inputDigests)) {
      problems.push('StageResult input digests do not match the execute handoff');
    }
    if (stageResult.changeId === changeId && stageResult.stage === 'clarify' && stageResult.runId === execute.input.runId
        && stageResult.selfCheck?.verdict === 'pass' && problems.length === 0) evidence.selfCheck = { status: 'pass', refs: [stagePath], result: stageResult };
    else {
      evidence.selfCheck = { status: statusFor(problems.join('; ')), refs: [stagePath] };
      return evidence;
    }
  } catch (error) {
    evidence.selfCheck = { status: statusFor(error), refs: [stagePath] };
    return evidence;
  }
  const check = latestRun(root, changeId, 'check', execute.input.runId);
  if (!check) return evidence;
  const reviewPath = v2ResultPath(root, changeId, check.input.runId, 'check');
  if (!fs.existsSync(reviewPath)) return evidence;
  let review;
  try {
    review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
    const problems = validateReviewResult(root, review, { stageResult });
    if (problems.length === 0 && review.verdict === 'pass') evidence.review = { status: 'pass', refs: [reviewPath], result: review };
    else evidence.review = { status: statusFor(problems.join('; ')), refs: [reviewPath] };
  } catch (error) {
    evidence.review = { status: statusFor(error), refs: [reviewPath] };
    return evidence;
  }
  const tecpcProblems = [
    ...validateTecpc(stageResult.tecpc),
    ...validateTecpc(review.tecpc),
  ];
  if (stageResult.tecpc?.correction !== null || review.tecpc?.correction !== null) tecpcProblems.push('TECPC correction remains');
  evidence.tecpc = tecpcProblems.length === 0
    ? { status: 'pass', refs: [stagePath, reviewPath] }
    : { status: statusFor(tecpcProblems.join('; ')), refs: [stagePath, reviewPath] };

  const proofRef = `harness/changes/${changeId}/evidence/completion/clarify.json`;
  const proofPath = resolveWithin(root, proofRef, 'ClarifyProof');
  if (!fs.existsSync(proofPath)) return evidence;
  try {
    const proof = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
    const problems = validateCompletionProof(root, proof);
    if (problems.length === 0 && proof.stage === 'clarify' && proof.changeId === changeId
        && proof.executionRunId === stageResult.runId && proof.reviewRunId === review.runId) evidence.proof = { status: 'pass', refs: [proofRef] };
    else evidence.proof = { status: statusFor(problems.join('; ')), refs: [proofRef] };
  } catch (error) {
    evidence.proof = { status: statusFor(error), refs: [proofRef] };
  }
  return evidence;
}

export function buildClarifyReadiness(root, changeId) {
  try {
    assertSafeId(changeId, 'changeId');
  } catch (error) {
    throw new Error(`EH-PATH-001: ${error.message}`);
  }
  const items = [];
  const requirements = readRequirements(root, changeId);
  const lanes = factLanes(requirements.content);
  const lanesDecided = lanes.length === 2 && new Set(lanes.map((cells) => cells[0])).size === 2
    && lanes.every((cells) => ['yes', 'no'].includes(String(cells[1]).toLowerCase()));
  items.push(immutableItem('research-lanes-decided', lanesDecided ? 'pass' : 'blocked', lanesDecided ? [requirements.ref] : [], RECOVERIES.research));

  let research = { refs: [], packets: [] };
  let researchStatus = 'blocked';
  if (lanesDecided) {
    try {
      research = freshResearch(root, changeId, lanes);
      researchStatus = 'pass';
    } catch (error) {
      researchStatus = statusFor(error);
    }
  }
  items.push(immutableItem('required-research-fresh', researchStatus, research.refs, RECOVERIES.research));
  const conflictsDisposed = researchStatus === 'pass'
    && research.packets.every((packet) => packet.degraded === false && packet.uncertainties.length === 0)
    && /[-*]\s*remaining fact uncertainty\s*[:：]\s*none\b/iu.test(section(requirements.content, '## 事实探索门禁'));
  items.push(immutableItem('research-conflicts-disposed', conflictsDisposed ? 'pass' : 'blocked', research.refs, RECOVERIES.research));

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
    const reference = state?.artifacts?.classification || { path: classificationRef, digest: sha256Artifact(root, classificationRef) };
    readClassificationArtifact(root, changeId, reference);
    items.push(immutableItem('classification-fresh', 'pass', [classificationRef], RECOVERIES.classification));
  } catch (error) {
    items.push(immutableItem('classification-fresh', statusFor(error), [], RECOVERIES.classification));
  }

  const completion = completionEvidence(root, changeId);
  items.push(immutableItem('self-check-passed', completion.selfCheck?.status || 'blocked', completion.selfCheck?.refs || [], RECOVERIES.selfCheck));
  items.push(immutableItem('independent-review-passed', completion.review?.status || 'blocked', completion.review?.refs || [], RECOVERIES.review));
  items.push(immutableItem('tecpc-complete', completion.tecpc?.status || 'blocked', completion.tecpc?.refs || [], RECOVERIES.tecpc));
  items.push(immutableItem('clarify-proof-fresh', completion.proof?.status || 'blocked', completion.proof?.refs || [], RECOVERIES.proof));

  const first = items.find(({ status }) => !['pass', 'not-applicable'].includes(status));
  return deepFreeze({
    status: first ? 'blocked' : 'ready',
    items,
    recovery: first ? { code: first.code, action: first.action } : null,
  });
}
