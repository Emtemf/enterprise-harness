import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';
import { isHarnessForkSkill, normalizeHarnessSkillName } from '../harness-skill-invocation.mjs';

export function postAgent({ root, event }) {
  if (!['Agent', 'Skill'].includes(event.tool_name)) return { exitCode: 0 };

  const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
  const invokedSkill = String(event.tool_input?.skill || '').trim();
  if (event.tool_name === 'Agent' && !isHarnessAgentType(requestedRaw)) return { exitCode: 0 };
  if (event.tool_name === 'Skill' && !isHarnessForkSkill(invokedSkill)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  const agentId = event.tool_response?.agentId
    || event.tool_response?.agent_id
    || event.tool_response?.tool_use_result?.agentId
    || event.tool_response?.tool_use_result?.agent_id;
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
  const dispatch = [...readAgentEvents(repoRoot, changeId)].reverse().find((item) => {
    if (item.kind !== 'dispatch' || item.toolUseId !== event.tool_use_id) return false;
    if (event.tool_name === 'Agent') {
      return item.requestedAgentType === normalizeAgentType(requestedRaw);
    }
    const normalizedInvokedSkill = normalizeHarnessSkillName(invokedSkill);
    return item.invocationTool === 'Skill' && item.preloadedSkill === normalizedInvokedSkill;
  });
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
    requestedAgentType: dispatch.requestedAgentType,
    rawRequestedAgentType: dispatch.rawRequestedAgentType,
    runId: dispatch.runId,
    behavior: dispatch.behavior,
    handoffRole: dispatch.handoffRole,
    handoffPath: matchingStop.handoffPath,
    invocationTool: event.tool_name,
    cwd,
  });
  return { exitCode: 0 };
}
