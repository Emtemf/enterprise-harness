import fs from 'node:fs';
import path from 'node:path';
import { loadHandoffV2, v2ResultPath } from '../core/handoff-v2.mjs';
import { trustedHandoffAgentBindings } from './agent-evidence.mjs';
import { validateResearchPacket } from './result-contract.mjs';
import { isSafeRelativePath } from './safe-paths.mjs';

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
  const problems = [];
  const refs = [];
  const packets = [];
  const lanesDecided = lanes.length === 2
    && new Set(lanes.map((cells) => cells[0])).size === 2
    && lanes.every((cells) => ['yes', 'no'].includes(String(cells[1]).toLowerCase()));
  if (!lanesDecided) problems.push('requirements fact lanes must decide code and docs exactly once');

  for (const [lane, required, briefRef, runId, packetRef, status] of lanes) {
    const requiredValue = String(required).toLowerCase();
    if (requiredValue === 'no') {
      if (String(status).toLowerCase() !== 'not-required') problems.push(`${lane} must be not-required`);
      continue;
    }
    if (requiredValue !== 'yes' || String(status).toLowerCase() !== 'complete') {
      problems.push(`${lane} required research is incomplete`);
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
      problems.push(`${lane} required ResearchPacket is invalid: ${error.message}`);
    }
  }
  const conflictsDisposed = problems.length === 0
    && packets.every((packet) => packet.degraded === false && packet.uncertainties.length === 0)
    && /[-*]\s*remaining fact uncertainty\s*[:：]\s*none\b/iu.test(factSection);
  if (lanesDecided && !conflictsDisposed) problems.push('research conflicts or uncertainties remain');
  return Object.freeze({
    lanesDecided,
    fresh: lanesDecided && problems.length === 0,
    conflictsDisposed,
    refs: Object.freeze([...refs]),
    packets: Object.freeze([...packets]),
    problems: Object.freeze([...problems]),
    requirementsRef,
  });
}
