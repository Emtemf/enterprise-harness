import fs from 'node:fs';
import path from 'node:path';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { readDecisionEvents } from '../core/decision-ledger.mjs';
import { trustedHandoffAgentBindings } from './agent-evidence.mjs';
import { sha256Artifact, validateResearchPacket } from './result-contract.mjs';
import { assertNoSymlinkComponents, isSafeRelativePath, resolveWithin } from './safe-paths.mjs';

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
  return content.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map(splitMarkdownRow)
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/u.test(cell)));
}

function sameDigestMap(left, right) {
  const entries = (value) => Object.entries(value || {}).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

export function readClarifyResearchEvidence(root, changeId, requirementsRef, content) {
  const factSection = section(content, '## 事实探索门禁');
  const lanes = tableRows(factSection)
    .filter((cells) => cells[0] !== 'Lane' && ['code', 'docs'].includes(cells[0]));
  const laneProblems = [];
  const packetProblems = [];
  const refs = [];
  const packets = [];
  let decisionEvents = [];
  try {
    decisionEvents = readDecisionEvents(root, changeId);
  } catch (error) {
    laneProblems.push(`lane applicability decisions are invalid: ${error.message}`);
  }
  const lanesDecided = lanes.length === 2
    && new Set(lanes.map((cells) => cells[0])).size === 2
    && lanes.every((cells) => ['yes', 'no'].includes(String(cells[1]).toLowerCase()));
  if (!lanesDecided) laneProblems.push('requirements fact lanes must decide code and docs exactly once');

  for (const [lane, required, briefRef, runId, packetRef, status] of lanes) {
    const requiredValue = String(required).toLowerCase();
    const selectedOption = requiredValue === 'yes' ? 'required' : 'not-required';
    const targetRef = `${requirementsRef}#fact-lane-${lane}`;
    const laneEvents = decisionEvents.filter((event) => (
      event.decisionType === 'lane-applicability' && event.targetRef === targetRef
    ));
    try {
      const event = laneEvents.length === 1 ? laneEvents[0] : null;
      if (!event) throw new Error(`requires exactly one DecisionEvent targeting ${targetRef}`);
      if (event.selectedOption !== selectedOption
        || JSON.stringify(event.options) !== JSON.stringify(['required', 'not-required'])) {
        throw new Error(`DecisionEvent does not match Required=${required}`);
      }
      if (!event.publicRationale?.trim()) throw new Error('DecisionEvent requires a public rationale');
      const requirementsPath = resolveWithin(root, requirementsRef, 'requirements');
      assertNoSymlinkComponents(root, requirementsPath, 'requirements');
      if (!Array.isArray(event.evidenceRefs) || event.evidenceRefs.length === 0) {
        throw new Error('DecisionEvent requires evidenceRefs');
      }
      for (const evidenceRef of event.evidenceRefs) {
        if (!Object.hasOwn(event.inputDigests || {}, evidenceRef)) {
          throw new Error(`DecisionEvent evidence ${evidenceRef} has no input digest`);
        }
      }
      for (const [inputRef, digest] of Object.entries(event.inputDigests || {})) {
        const inputPath = resolveWithin(root, inputRef, 'lane applicability evidence');
        assertNoSymlinkComponents(root, inputPath, 'lane applicability evidence');
        if (sha256Artifact(root, inputRef) !== digest) {
          throw new Error(`DecisionEvent evidence is stale: ${inputRef}`);
        }
      }
    } catch (error) {
      laneProblems.push(`${lane} lane applicability ${error.message}`);
    }
    if (requiredValue === 'no') {
      if (String(status).toLowerCase() !== 'not-required') packetProblems.push(`${lane} must be not-required`);
      const rationale = String(lanes.find((cells) => cells[0] === lane)?.[6] || '').trim().toLowerCase();
      if (!rationale || ['none', 'n/a'].includes(rationale)) packetProblems.push(`${lane} not-required rationale is missing`);
      continue;
    }
    if (requiredValue !== 'yes' || String(status).toLowerCase() !== 'complete') {
      packetProblems.push(`${lane} required research is incomplete`);
      continue;
    }
    try {
      if (!isSafeRelativePath(briefRef) || !isSafeRelativePath(packetRef)) {
        throw new Error('brief and packet refs must be safe repository-relative paths');
      }
      const input = loadHandoffV2(root, changeId, runId);
      const expectedSource = lane === 'code' ? 'code-explore' : 'doc-research';
      const expectedBehavior = lane === 'code' ? 'clarify.explore-code' : 'clarify.research-docs';
      if (input.stage !== 'clarify' || input.role !== 'execute' || input.behavior !== expectedBehavior
          || !input.inputRefs.includes(briefRef)) throw new Error('handoff does not match the required lane');
      const resultPath = v2ResultPath(root, changeId, runId);
      const canonicalRef = path.relative(root, resultPath).split(path.sep).join('/');
      if (!isSafeRelativePath(canonicalRef) || packetRef !== canonicalRef || !fs.existsSync(resultPath)) {
        throw new Error(`packet ref must match safe canonical result ${canonicalRef}`);
      }
      const packet = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
      const packetProblems = validateResearchPacket(root, packet);
      if (packetProblems.length > 0 || packet.changeId !== changeId || packet.source !== expectedSource
          || JSON.stringify(packet.inputRefs) !== JSON.stringify(input.inputRefs)
          || !sameDigestMap(packet.inputDigests, input.inputDigests)) {
        throw new Error(`ResearchPacket is invalid or stale: ${packetProblems.join('; ')}`);
      }
      const bindings = trustedHandoffAgentBindings(root, changeId, input)
        .filter(({ binding }) => binding !== null);
      if (bindings.length !== 1) throw new Error('ResearchPacket has no unique trusted completed agent binding');
      refs.push(canonicalRef);
      packets.push(packet);
    } catch (error) {
      packetProblems.push(`${lane} required ResearchPacket is invalid: ${error.message}`);
    }
  }
  const fresh = lanesDecided && laneProblems.length === 0 && packetProblems.length === 0;
  const conflictProblems = [];
  if (fresh && packets.some((packet) => packet.degraded !== false)) conflictProblems.push('research packet is degraded');
  if (fresh && packets.some((packet) => packet.uncertainties.length > 0)) conflictProblems.push('research packet uncertainties remain');
  if (fresh && !/[-*]\s*remaining fact uncertainty\s*[:：]\s*none\b/iu.test(factSection)) {
    conflictProblems.push('remaining fact uncertainty is not disposed');
  }
  const conflictsDisposed = fresh && conflictProblems.length === 0;
  const problems = [...laneProblems, ...packetProblems, ...conflictProblems];
  return Object.freeze({
    lanesDecided,
    fresh,
    conflictsDisposed,
    refs: Object.freeze([...refs]),
    packets: Object.freeze([...packets]),
    laneProblems: Object.freeze([...laneProblems]),
    packetProblems: Object.freeze([...packetProblems]),
    conflictProblems: Object.freeze([...conflictProblems]),
    problems: Object.freeze([...problems]),
    requirementsRef,
  });
}
