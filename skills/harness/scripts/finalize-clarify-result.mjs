import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { trustedHandoffAgentBindings } from '../../../runtime/api/agent-evidence.mjs';
import {
  loadHandoffV2,
  persistHandoffV2Result,
  readClassificationArtifact,
  v2ResultPath,
} from '../../../runtime/api/handoff.mjs';
import {
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

function section(content, heading, nextHeading = '\n## ') {
  const start = content.lastIndexOf(heading);
  if (start < 0) return '';
  const rest = content.slice(start + heading.length);
  const end = rest.indexOf(nextHeading);
  return end < 0 ? rest : rest.slice(0, end);
}

function tableRows(content) {
  return content.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^:?-+:?$/u.test(cell)));
}

function fieldValue(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return content.match(new RegExp(`[-*]\\s*${escaped}\\s*[:：]\\s*(.+)$`, 'imu'))?.[1]?.trim() ?? null;
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
    '## Frontier',
    '## 事实、约束与条件分支',
    '## Classification',
    '## 未决决策与确认',
  ];
  const problems = required
    .filter((heading) => !content.includes(heading))
    .map((heading) => `requirements.md is missing ${heading}`);
  if (!/\bR\d+\b/u.test(content)) problems.push('requirements.md must contain stable requirement IDs');
  const factGateSection = section(content, '## 事实探索门禁');
  const topologySection = section(content, '## 组件拓扑');
  const scoringSection = section(content, '## Component × Dimension 评分');
  const confirmationSection = section(content, '## 未决决策与确认');
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

  const scoringRows = tableRows(scoringSection)
    .filter((cells) => cells[0] !== 'Component');
  for (const component of activeComponents) {
    for (const dimension of CORE_DIMENSIONS) {
      const matches = scoringRows.filter((cells) => cells[0] === component && cells[1] === dimension);
      if (matches.length !== 1) {
        problems.push(`${component} must contain exactly one ${dimension} score`);
        continue;
      }
      const [, , , currentScore, evidence, , gapType, ownerStatus, source] = matches[0];
      const score = Number(currentScore);
      if (!Number.isInteger(score) || score < 0 || score > 5) {
        problems.push(`${component} × ${dimension} score must be an integer from 0 to 5`);
      } else if (score < 4) {
        problems.push(`${component} × ${dimension} is below readiness threshold: ${score}`);
      }
      if (!evidence || !source) problems.push(`${component} × ${dimension} is missing scoring evidence or source`);
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

  const ledgerRows = tableRows(confirmationSection).filter((cells) => cells[0] !== 'Round');
  if (ledgerRows.length === 0) problems.push('requirements.md must contain at least one round ledger record');
  for (const cells of ledgerRows) {
    const [, , type, questionOrFact, , answerOrResult, ownerStatus, , , source] = cells;
    if (!['Fact', 'Decision'].includes(type)) problems.push('round ledger Type must be Fact or Decision');
    if (!questionOrFact || !answerOrResult || !ownerStatus || !source) {
      problems.push('round ledger must record input, result, Owner / status, and Source');
    }
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
    if (sha256Artifact(root, ref) !== input.inputDigests[ref]) {
      throw new Error(`EH-CLARIFY-FINALIZE-001: handoff input digest is stale: ${ref}`);
    }
  }
  const requirementsPath = `harness/changes/${changeId}/requirements.md`;
  const classificationPath = `harness/changes/${changeId}/classification.json`;
  const requirementsAbsolute = path.join(root, requirementsPath);
  if (!fs.existsSync(requirementsAbsolute)) throw new Error(`EH-CLARIFY-FINALIZE-002: missing ${requirementsPath}`);
  const shapeProblems = assertRequirements(fs.readFileSync(requirementsAbsolute, 'utf-8'), {
    root,
    changeId,
    confirmedInput: input,
  });
  if (shapeProblems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-003: ${shapeProblems.join('; ')}`);
  const classification = readClassificationArtifact(root, changeId, {
    path: classificationPath,
    digest: input.inputDigests?.[classificationPath],
  });
  const assertions = [
    { id: 'requirements-shape', verdict: 'pass', evidence: [requirementsPath] },
    { id: 'classification-fresh-and-valid', verdict: 'pass', evidence: [classificationPath] },
    { id: 'scope-confirmed', verdict: 'pass', evidence: [requirementsPath] },
  ];
  const result = {
    resultVersion: 1,
    type: 'stage-result',
    changeId,
    stage: 'clarify',
    runId,
    producer: { agentType: input.agent.type, skill: input.agent.skill },
    inputDigests: { ...input.inputDigests },
    artifacts: [
      { path: requirementsPath, digest: sha256Artifact(root, requirementsPath) },
      { path: classificationPath, digest: sha256Artifact(root, classificationPath) },
    ],
    assertions,
    selfCheck: {
      verdict: 'pass',
      findings: [],
      evidence: assertions.flatMap((assertion) => assertion.evidence),
    },
    tecpc: {
      ...input.tecpc,
      evidence: [...new Set([...input.tecpc.evidence, requirementsPath, classificationPath])],
      context: [...new Set([...input.tecpc.context, requirementsPath])],
      correction: null,
    },
    status: 'pass',
    needsDecision: null,
    completedAt: new Date().toISOString(),
  };
  const problems = validateStageResult(root, result);
  if (problems.length > 0) throw new Error(`EH-CLARIFY-FINALIZE-004: ${problems.join('; ')}`);
  void classification;
  const persisted = persistHandoffV2Result(root, changeId, runId, result);
  process.stdout.write(`HANDOFF_RESULT=${path.relative(root, persisted.path)}\n`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
