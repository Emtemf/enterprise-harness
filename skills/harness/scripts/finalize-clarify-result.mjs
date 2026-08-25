import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { trustedHandoffAgentBindings } from '../../../runtime/api/agent-evidence.mjs';
import {
  loadHandoffV2,
  persistHandoffV2Result,
  v2ResultPath,
} from '../../../runtime/api/handoff.mjs';
import {
  clarifyStageResultProjection,
  requiredStageResultArtifacts,
  sha256Artifact,
  validateResearchPacket,
  validateStageResult,
} from '../../../runtime/api/result.mjs';

const [changeId, runId] = process.argv.slice(2);
if (!changeId || !runId) {
  console.error('Usage: node finalize-clarify-result.mjs <change-id> <run-id>');
  process.exit(2);
}

const CORE_DIMENSIONS = ['Goal', 'Scope', 'Constraints', 'Acceptance', 'Context'];
const READINESS_PREDICATES = {
  Goal: ['consumer', 'outcome'],
  Scope: ['included', 'excluded'],
  Constraints: ['technical', 'risk'],
  Acceptance: ['success', 'failure', 'observable'],
  Context: ['need', 'current-state'],
};
const AUTH_DECISION_SURFACES = [
  'identity-source',
  'credential-authority',
  'session-lifecycle',
  'failure-abuse',
  'recovery-mfa',
  'observable-acceptance',
];
const AUTH_REQUEST_PATTERN = /登录|登入|登陆|用户认证|用户身份|login|log-in|sign[ -]?in|signin|authentication|authenticate|\bauth\b|credential|身份认证|session/iu;
const EXPLICIT_CONFIRMATION_PATTERN = /^(?:我(?:明确)?确认以上范围|我们(?:明确)?确认以上范围|确认以上范围并进入设计|同意以上需求并进入设计|批准以上方案并进入设计|按此进入设计|可以进入设计|(?:yes[,，:]?\s*)?(?:i|we)\s+(?:explicitly\s+)?confirm\s+the\s+scope|(?:i|we)\s+approve\s+these\s+requirements|confirmed:\s+the\s+scope|approved:\s+these\s+requirements|please\s+proceed\s+to\s+design|confirm|confirmed|approve|approved|proceed)$/iu;
const NEGATED_CONFIRMATION_PATTERN = /(?:不|未|无|没|否|不能|无法|并未|尚未|拒绝).{0,8}(?:确认|同意|批准|授权|进入)|\b(?:cannot|can't|cant|do not|don't|dont|did not|didn't|not|never|won't|wont|wouldn't|shouldn't|haven't|hasn't|hadn't|refuse(?:d)? to|decline(?:d)? to)\b(?:\s+[\p{L}\p{N}'-]+){0,4}\s+\b(?:confirm|approve|proceed|authorize)\w*\b|\bunconfirmed\b|\bdisapprove(?:d)?\b/iu;

function occurrences(content, needle) {
  return content.split(needle).length - 1;
}

function section(content, heading, nextHeading = '\n## ') {
  const start = content.indexOf(heading);
  if (start < 0) return '';
  const rest = content.slice(start + heading.length);
  const end = rest.indexOf(nextHeading);
  return end < 0 ? rest : rest.slice(0, end);
}

function splitMarkdownRow(line) {
  const cells = [];
  let cell = '';
  let escaped = false;
  for (const character of line.slice(1, -1)) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function tableRows(content) {
  return content.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map(splitMarkdownRow)
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^:?-+:?$/u.test(cell)));
}

function normalizedClause(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[。；;.!?！？]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function sourceClauses(value) {
  return new Set(String(value || '')
    .split(/[。；;.!?！？\n]+/u)
    .map(normalizedClause)
    .filter(Boolean));
}

function isExplicitAffirmativeConfirmation(value) {
  return EXPLICIT_CONFIRMATION_PATTERN.test(value) && !NEGATED_CONFIRMATION_PATTERN.test(value);
}

function between(content, startHeading, endHeading) {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) return '';
  return content.slice(start + startHeading.length, end);
}

function fieldValue(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return content.match(new RegExp(`[-*]\\s*${escaped}\\s*[:：]\\s*(.+)$`, 'imu'))?.[1]?.trim() ?? null;
}

function commaSet(value) {
  return new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
}

function normalizedRelative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

function assertRequirements(content, { root, changeId, confirmedInput }) {
  const required = [
    '# Requirements',
    '## 目标与验收',
    '## 事实探索门禁',
    '## 组件拓扑',
    '## Evidence ledger',
    '## Frontier',
    '## 事实、约束与条件分支',
    '## Classification',
    '## 未决决策与确认',
  ];
  const problems = [];
  for (const heading of required) {
    const count = occurrences(content, heading);
    if (count === 0) problems.push(`requirements.md is missing ${heading}`);
    if (count > 1) problems.push(`requirements.md must contain exactly one ${heading} heading`);
  }
  if (occurrences(content, '## Component × Dimension 评分') !== 1) {
    problems.push('requirements.md must contain exactly one ## Component × Dimension 评分 heading');
  }
  for (const heading of ['### 原始需求', '### 澄清后的目标']) {
    if (occurrences(content, heading) !== 1) problems.push(`requirements.md must contain exactly one ${heading} heading`);
  }
  if (!/\bR\d+\b/u.test(content)) problems.push('requirements.md must contain stable requirement IDs');
  const factGateSection = section(content, '## 事实探索门禁');
  const topologySection = section(content, '## 组件拓扑');
  const evidenceSection = section(content, '## Evidence ledger');
  const scoringSection = section(content, '## Component × Dimension 评分');
  const confirmationSection = section(content, '## 未决决策与确认');
  const factsAndConstraintsSection = section(content, '## 事实、约束与条件分支');
  const originalRequestSection = between(section(content, '## 目标与验收'), '### 原始需求', '### 澄清后的目标');
  if (/^###\s+/mu.test(originalRequestSection)) {
    problems.push('original request must not contain an unescaped level-3 heading');
  }
  const researchClaimsByLocator = new Map();
  if (!/[-*]\s*fact gate complete\s*[:：]\s*true\b/iu.test(factGateSection)) {
    problems.push('requirements.md must record fact gate complete: true');
  }
  const factRows = tableRows(factGateSection).filter((cells) => cells[0] !== 'Lane');
  const expectedLanes = ['code', 'docs'];
  if (factRows.length !== expectedLanes.length
    || expectedLanes.some((lane) => factRows.filter((cells) => cells[0] === lane).length !== 1)
    || factRows.some((cells) => !expectedLanes.includes(cells[0]))) {
    problems.push('requirements.md fact discovery gate must contain exactly one code and one docs lane');
  }
  const remainingFact = fieldValue(factGateSection, 'remaining fact uncertainty');
  if (!remainingFact || remainingFact.toLowerCase() !== 'none') {
    problems.push('remaining fact uncertainty must be none');
  }
  for (const [lane, required, briefRef, runId, packetRef, status, rationale] of factRows) {
    const normalizedRequired = String(required || '').toLowerCase();
    if (!['yes', 'no'].includes(normalizedRequired)) {
      problems.push(`fact lane ${lane} Required must be yes or no`);
      continue;
    }
    if (normalizedRequired === 'no') {
      if (String(status || '').toLowerCase() !== 'not-required') {
        problems.push(`not-required lane ${lane} must use status not-required`);
      }
      if (!rationale || ['none', 'n/a'].includes(String(rationale).trim().toLowerCase())) {
        problems.push(`not-required lane ${lane} must record rationale`);
      }
      continue;
    }
    if (String(status || '').toLowerCase() !== 'complete') problems.push(`required fact lane ${lane} must be complete`);
    if (!briefRef || String(briefRef).toLowerCase() === 'none'
      || !runId || String(runId).toLowerCase() === 'none'
      || !packetRef || String(packetRef).toLowerCase() === 'none') {
      problems.push(`required fact lane ${lane} must record brief ref, runId, and packet ref`);
      continue;
    }
    try {
      const factInput = loadHandoffV2(root, changeId, runId);
      const expected = lane === 'code'
        ? { behavior: 'clarify.explore-code', agent: 'enterprise-harness:code-explore', source: 'code-explore' }
        : lane === 'docs'
          ? { behavior: 'clarify.research-docs', agent: 'enterprise-harness:doc-research', source: 'doc-research' }
          : null;
      if (!expected) throw new Error(`unknown required lane ${lane}`);
      if (factInput.stage !== 'clarify' || factInput.behavior !== expected.behavior
        || factInput.role !== 'execute' || factInput.agent?.type !== expected.agent) {
        throw new Error('handoff does not match the required lane');
      }
      if (!factInput.inputRefs.includes(briefRef)) throw new Error('handoff does not consume the recorded brief ref');
      if (!confirmedInput.inputRefs.includes(briefRef)) {
        throw new Error('confirmed handoff must bind required fact brief');
      }
      const canonicalPath = v2ResultPath(root, changeId, runId);
      const canonicalRef = normalizedRelative(root, canonicalPath);
      if (packetRef !== canonicalRef) problems.push(`required fact lane ${lane} packet ref must match canonical result ${canonicalRef}`);
      const packet = JSON.parse(fs.readFileSync(canonicalPath, 'utf-8'));
      const packetProblems = validateResearchPacket(root, packet);
      if (packetProblems.length > 0) throw new Error(packetProblems.join('; '));
      if (packet.degraded || packet.uncertainties.length > 0) {
        throw new Error('packet is degraded or unresolved uncertainty remains');
      }
      if (packet.changeId !== changeId || packet.source !== expected.source
        || JSON.stringify(packet.inputRefs) !== JSON.stringify(factInput.inputRefs)
        || !sameDigestMap(packet.inputDigests, factInput.inputDigests)) {
        throw new Error('packet does not bind the recorded handoff inputs');
      }
      const trustedBindings = trustedHandoffAgentBindings(root, changeId, factInput)
        .filter((binding) => binding.binding !== null);
      if (trustedBindings.length !== 1) throw new Error('missing trusted completed fact agent binding');
      researchClaimsByLocator.set(`fact:${lane}`, new Set(packet.facts.map((fact) => normalizedClause(fact.claim))));
    } catch (error) {
      problems.push(`required fact lane ${lane} packet is invalid: ${error.message}`);
    }
  }
  if (!/[-*]\s*topology confirmed\s*[:：]\s*true\b/iu.test(topologySection)) {
    problems.push('requirements.md must record topology confirmed: true');
  }
  if (!/[-*]\s*scope confirmed\s*[:：]\s*true\b/iu.test(confirmationSection)) {
    problems.push('requirements.md must record scope confirmed: true');
  }

  const topologyRows = tableRows(topologySection);
  const activeComponents = topologyRows
    .filter((cells) => cells[0] !== 'Component' && cells[2]?.toLowerCase() === 'active')
    .map((cells) => cells[0]);
  if (activeComponents.length === 0) problems.push('requirements.md must contain at least one active component');

  const roundLedgerRows = tableRows(confirmationSection).filter((cells) => cells[0] !== 'Round');
  if (roundLedgerRows.length === 0) problems.push('requirements.md must contain at least one round ledger record');
  const userDecisionAnswersByRound = new Map();
  const seenRounds = new Set();
  for (const cells of roundLedgerRows) {
    const [round, , type, questionOrFact, , answerOrResult, ownerStatus, , , source] = cells;
    if (!['Fact', 'Decision'].includes(type)) problems.push('round ledger Type must be Fact or Decision');
    if (!questionOrFact || !answerOrResult || !ownerStatus || !source) {
      problems.push('round ledger must record input, result, Owner / status, and Source');
    }
    if (seenRounds.has(round)) problems.push(`round ledger must contain exactly one record for round ${round}`);
    seenRounds.add(round);
    if (type === 'Decision' && /^user\s*\/\s*resolved$/iu.test(ownerStatus || '') && /^user$/iu.test(source || '')) {
      userDecisionAnswersByRound.set(round, answerOrResult || '');
    } else if (type === 'Decision') {
      problems.push(`round ${round} Decision evidence must be owned and resolved by user with Source user`);
    }
  }

  const evidenceRows = tableRows(evidenceSection).filter((cells) => cells[0] !== 'Evidence ID');
  const evidenceById = new Map();
  const evidenceClaims = new Set();
  for (const [id, kind, locator, claim, supports] of evidenceRows) {
    if (!id || evidenceById.has(id)) {
      problems.push('evidence ledger IDs must be non-empty and unique');
      continue;
    }
    const supportSet = commaSet(supports);
    if (!['raw-request', 'user-decision', 'research-packet'].includes(kind)) {
      problems.push(`evidence ${id} has unsupported kind ${kind || '(blank)'}`);
    }
    if (!locator || !claim || supportSet.size === 0) {
      problems.push(`evidence ${id} must record locator, claim, and supported predicates`);
    } else if (kind === 'raw-request' && locator !== 'original-request') {
      problems.push(`evidence ${id} raw-request locator must be original-request`);
    } else if (kind === 'raw-request' && !sourceClauses(originalRequestSection).has(normalizedClause(claim))) {
      problems.push(`evidence ${id} claim must exactly match one clause in the original request`);
    } else if (kind === 'user-decision') {
      const round = locator.match(/^round:(\d+)$/u)?.[1];
      if (!round || !sourceClauses(userDecisionAnswersByRound.get(round)).has(normalizedClause(claim))) {
        problems.push(`evidence ${id} claim must exactly match one clause from a resolved user Decision`);
      }
    } else if (kind === 'research-packet' && !researchClaimsByLocator.get(locator)?.has(normalizedClause(claim))) {
      problems.push(`evidence ${id} claim must exactly match a fact claim in the validated ResearchPacket`);
    }
    const canonicalLocator = kind === 'raw-request' ? 'original-request' : locator;
    const provenanceKey = `${kind}\u0000${canonicalLocator}\u0000${normalizedClause(claim)}`;
    if (evidenceClaims.has(provenanceKey)) {
      problems.push(`evidence ${id} reuses a source clause that already supports another ledger entry`);
    }
    evidenceClaims.add(provenanceKey);
    const confirmedTargets = [...supportSet].filter((support) => support.endsWith('.confirmed'));
    if (confirmedTargets.length > 0) {
      if (confirmedTargets.length !== supportSet.size
        || !['raw-request', 'user-decision'].includes(kind)
        || !isExplicitAffirmativeConfirmation(claim)) {
        problems.push(`evidence ${id} confirmation support requires an explicit raw request or resolved user Decision confirmation`);
      }
    } else if (supportSet.size !== 1) {
      problems.push(`evidence ${id} must support exactly one readiness or decision-surface target`);
    }
    evidenceById.set(id, { kind, locator, claim, supports: supportSet });
  }

  if (AUTH_REQUEST_PATTERN.test(originalRequestSection)) {
    const applicability = fieldValue(factsAndConstraintsSection, 'Authentication/identity');
    const authSection = section(factsAndConstraintsSection, '### Authentication decision surfaces', '\n### ');
    const authRows = tableRows(authSection).filter((cells) => cells[0] !== 'Surface');
    if (!applicability?.startsWith('适用')) {
      problems.push('authentication decision surfaces must be marked applicable for authentication work');
    }
    if (authRows.length !== AUTH_DECISION_SURFACES.length
      || AUTH_DECISION_SURFACES.some((surface) => authRows.filter((cells) => cells[0] === surface).length !== 1)) {
      problems.push('authentication decision surfaces must contain exactly one row for every required surface');
    }
    for (const [surface, applicable, resolution, evidenceRef, status] of authRows) {
      if (!AUTH_DECISION_SURFACES.includes(surface)) {
        problems.push(`authentication decision surfaces contain unknown surface ${surface}`);
        continue;
      }
      if (!['yes', 'no'].includes(applicable)) {
        problems.push(`authentication surface ${surface} Applicable must be yes or no`);
      }
      if (!resolution || !evidenceRef) {
        problems.push(`authentication surface ${surface} must record resolution/rationale and evidence ref`);
      }
      if (applicable === 'yes' && status !== 'resolved') {
        problems.push(`authentication surface ${surface} must be resolved`);
      }
      if (applicable === 'no' && status !== 'not-applicable') {
        problems.push(`authentication surface ${surface} must use not-applicable status`);
      }
      if (!evidenceById.get(evidenceRef)?.supports.has(`auth:${surface}`)) {
        problems.push(`authentication surface ${surface} has no supporting evidence ref`);
      }
    }
  }

  const scoringRows = tableRows(scoringSection)
    .filter((cells) => cells[0] !== 'Component');
  for (const component of activeComponents) {
    for (const dimension of CORE_DIMENSIONS) {
      const matches = scoringRows.filter((cells) => cells[0] === component && cells[1] === dimension);
      if (matches.length !== 1) {
        problems.push(`${component} must contain exactly one ${dimension} score`);
        continue;
      }
      const [, , , currentScore, predicateCoverage, evidenceRefs, , gapType, ownerStatus] = matches[0];
      const score = Number(currentScore);
      if (!Number.isInteger(score) || score < 0 || score > 5) {
        problems.push(`${component} × ${dimension} score must be an integer from 0 to 5`);
      } else if (score < 4) {
        problems.push(`${component} × ${dimension} is below readiness threshold: ${score}`);
      }
      const covered = commaSet(predicateCoverage);
      const refs = commaSet(evidenceRefs);
      if (refs.size === 0) problems.push(`${component} × ${dimension} is missing evidence refs`);
      for (const predicate of READINESS_PREDICATES[dimension]) {
        const support = `${component}:${dimension}.${predicate}`;
        if (!covered.has(predicate)) {
          problems.push(`${component} × ${dimension} predicate coverage is missing ${predicate}`);
        }
        const supportingRefs = [...refs].filter((ref) => evidenceById.get(ref)?.supports.has(support));
        if (supportingRefs.length === 0) {
          problems.push(`${component} × ${dimension}.${predicate} has no supporting evidence ref`);
        }
      }
      if (score === 5) {
        const confirmedSupport = `${component}:${dimension}.confirmed`;
        if (!covered.has('confirmed')) {
          problems.push(`${component} × ${dimension} score 5 requires confirmed predicate coverage`);
        }
        if (![...refs].some((ref) => evidenceById.get(ref)?.supports.has(confirmedSupport))) {
          problems.push(`${component} × ${dimension}.confirmed has no supporting evidence ref`);
        }
      }
      for (const ref of refs) {
        if (!evidenceById.has(ref)) problems.push(`${component} × ${dimension} references unknown evidence ref ${ref}`);
      }
      if (!['Fact', 'Decision', 'resolved'].includes(gapType)) {
        problems.push(`${component} × ${dimension} Gap type must be Fact, Decision, or resolved`);
      }
      if (!ownerStatus) problems.push(`${component} × ${dimension} must record gap Owner / status`);
    }
  }

  for (const [label, source] of [
    ['unresolved high-risk assumption', scoringSection],
    ['unresolved high-risk decision', confirmationSection],
  ]) {
    const value = fieldValue(source, label);
    if (!value || value.toLowerCase() !== 'none') problems.push(`${label} must be none; unresolved high-risk gap remains`);
  }

  if (/\b(TODO|TBD|待补充|<[^>]+>)\b/iu.test(content)) problems.push('requirements.md contains an unresolved placeholder');
  return problems;
}

try {
  const root = process.cwd();
  const input = loadHandoffV2(root, changeId, runId);
  if (input.role !== 'execute' || input.stage !== 'clarify'
    || input.agent?.type !== 'enterprise-harness:main' || input.agent?.skill !== 'harness') {
    throw new Error('EH-CLARIFY-FINALIZE-001: handoff must be a main-owned clarify execute run');
  }
  for (const ref of input.inputRefs) {
    try {
      if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
        throw new Error(`handoff input digest is stale: ${ref}`);
      }
    } catch (error) {
      throw new Error(`EH-CLARIFY-FINALIZE-001: ${error.message}. Recreate the Clarify execute handoff from current canonical inputs.`);
    }
  }
  const artifactPaths = requiredStageResultArtifacts(changeId, 'clarify');
  const [requirementsPath] = artifactPaths;
  const requirementsAbsolute = path.join(root, requirementsPath);
  if (!fs.existsSync(requirementsAbsolute)) throw new Error(`EH-CLARIFY-FINALIZE-002: missing ${requirementsPath}`);
  const shapeProblems = assertRequirements(fs.readFileSync(requirementsAbsolute, 'utf-8'), {
    root,
    changeId,
    confirmedInput: input,
  });
  if (shapeProblems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-003: ${shapeProblems.join('; ')}`);
  const projection = clarifyStageResultProjection(root, changeId);
  const assertions = projection.assertions.map((item) => ({
    ...item,
    evidence: [...item.evidence],
  }));
  if (projection.status !== 'ready') {
    throw new Error(`${projection.recovery.code}: ${projection.recovery.action}`);
  }
  if (input.tecpc?.correction !== null) {
    throw new Error('EH-CLARIFY-TECPC-142: Complete the Clarify TECPC envelope without a pending correction.');
  }
  const boundRefs = new Set(Object.keys(input.inputDigests || {}));
  const unboundRefs = [...new Set([...artifactPaths, ...assertions.flatMap(({ evidence }) => evidence)])]
    .filter((reference) => !boundRefs.has(reference));
  if (unboundRefs.length > 0) {
    throw new Error(`EH-CLARIFY-FINALIZE-001: execute handoff does not freeze ${unboundRefs.join(', ')}. Recreate the Clarify execute handoff from current canonical inputs.`);
  }
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: artifactPaths.map((artifactPath) => ({
      path: artifactPath,
      digest: sha256Artifact(root, artifactPath),
    })),
    assertions,
    selfCheck: {
      verdict: 'pass',
      findings: [],
      evidence: assertions.flatMap((assertion) => assertion.evidence),
    },
    tecpc: {
      ...input.tecpc,
      evidence: [...new Set([...input.tecpc.evidence, ...assertions.flatMap(({ evidence }) => evidence)])],
      context: [...new Set([...input.tecpc.context, ...artifactPaths])],
      correction: null,
    },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-004: ${problems.join('; ')}`);
  const persisted = persistHandoffV2Result(root, changeId, runId, result);
  process.stdout.write(`HANDOFF_RESULT=${path.relative(root, persisted.path)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
