import {
  activeChangeId,
  appendAgentEvent,
  gitCommonDir,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import path from 'node:path';

export function postAgent({ root, event }) {
  if (event.tool_name !== 'Agent') return { exitCode: 0 };

  const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
  if (!isHarnessAgentType(requestedRaw)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const commonDir = gitCommonDir(cwd);
  const repoRoot = path.resolve(commonDir, '..');
  const changeId = activeChangeId(repoRoot);
  const agentId = event.tool_response?.agentId || event.tool_response?.agent_id;
  if (!changeId || !event.tool_use_id || !agentId) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-AGENT-BINDING-003',
        'PostToolUse requires active change, tool_use_id, and agentId',
        { changeId },
      ),
    };
  }
  const dispatch = [...readAgentEvents(repoRoot, changeId)].reverse().find((item) => (
    item.kind === 'dispatch'
    && item.toolUseId === event.tool_use_id
    && item.requestedAgentType === normalizeAgentType(requestedRaw)
  ));
  if (!dispatch) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-AGENT-BINDING-003',
        'Agent result has no matching scoped dispatch receipt',
        { changeId },
      ),
    };
  }
  const matchingStop = [...readAgentEvents(repoRoot, changeId)].reverse().find((item) => (
    item.kind === 'stop'
    && item.agentId === agentId
    && item.runId === dispatch.runId
    && item.observedAgentType === dispatch.requestedAgentType
  ));
  if (!matchingStop) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-AGENT-BINDING-003',
        'Agent result has no matching structured SubagentStop receipt',
        { changeId, runId: dispatch.runId },
      ),
    };
  }
  appendAgentEvent(repoRoot, changeId, {
    kind: 'dispatch-binding',
    sessionId: event.session_id,
    toolUseId: event.tool_use_id,
    agentId,
    requestedAgentType: normalizeAgentType(requestedRaw),
    rawRequestedAgentType: requestedRaw,
    runId: dispatch.runId,
    behavior: dispatch.behavior,
    handoffRole: dispatch.handoffRole,
    handoffPath: matchingStop.handoffPath,
    cwd,
  });
  return { exitCode: 0 };
}
