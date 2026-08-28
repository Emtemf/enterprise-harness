import fs from 'node:fs';
import path from 'node:path';
import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
} from '../agent-evidence.mjs';
import {
  loadHandoffV2FromMarker,
  parseHandoffV2Marker,
} from '../../core/handoff-v2.mjs';
import {
  loadHandoffInput,
  parseHandoffInputMarker,
} from '../handoff.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { formatHandoffGuidance, suggestHandoffCommand } from '../handoff-guidance.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';

export function preAgent({ root, event }) {
  if (event.tool_name !== 'Agent') return { exitCode: 0 };

  // Agent types arrive scoped (`enterprise-harness:code-explore`) when loaded as a plugin and
  // bare (`code-explore`) when the same definitions load from this repo's own agents directory.
  // Both spellings denote the same governed agent, so normalize instead of demanding a prefix
  // the local registry cannot resolve — the handoff evidence below is what actually gates.
  const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
  if (!isHarnessAgentType(requestedRaw)) return { exitCode: 0 };

  const repoRoot = hookRepoRoot(root, event);
  const cwd = event.cwd || root;
  const changeId = hookChangeId(repoRoot, event);
  if (!changeId) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-HANDOFF-INPUT-001',
        'harness Agent dispatch requires an active change',
      ),
    };
  }
  const isV6 = (() => {
    try {
      const statePath = path.join(repoRoot, 'harness', 'changes', changeId, 'state.json');
      return JSON.parse(fs.readFileSync(statePath, 'utf-8')).schemaVersion === 6;
    } catch {
      return false;
    }
  })();
  const marker = isV6
    ? parseHandoffV2Marker(event.tool_input?.prompt)
    : parseHandoffInputMarker(event.tool_input?.prompt);
  if (!marker) {
    // The caller is being told to satisfy a rule it was never taught, so name the
    // exact command rather than leaving it to guess the behavior string.
    const guidance = formatHandoffGuidance(suggestHandoffCommand(repoRoot, requestedRaw, changeId));
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-HANDOFF-INPUT-001',
        `Agent prompt must equal exactly HANDOFF_INPUT=<canonical input.json path>${guidance ? ` | ${guidance}` : ''}`,
        { changeId },
      ),
    };
  }
  const loaded = isV6
    ? loadHandoffV2FromMarker(repoRoot, marker, { changeId, agentType: requestedRaw })
    : loadHandoffInput(repoRoot, marker, { changeId, agentType: requestedRaw });
  if (!loaded.ok) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-HANDOFF-SCHEMA-002',
        loaded.problems.join('; '),
        { changeId, runId: loaded.envelope?.runId },
      ),
    };
  }
  appendAgentEvent(repoRoot, changeId, {
    kind: 'dispatch',
    sessionId: event.session_id,
    toolUseId: event.tool_use_id,
    requestedAgentType: normalizeAgentType(requestedRaw),
    rawRequestedAgentType: requestedRaw,
    runId: loaded.envelope.runId,
    behavior: loaded.envelope.behavior,
    handoffRole: loaded.envelope.role,
    handoffPath: marker,
    parentRunId: loaded.envelope.parentRunId,
    preloadedSkill: loaded.envelope.agent.skill,
    cwd,
  });
  return { exitCode: 0 };
}
