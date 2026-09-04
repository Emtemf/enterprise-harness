import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';
import { isHarnessForkSkill, normalizeHarnessSkillName } from '../harness-skill-invocation.mjs';

function responseAgentId(value, seen = new Set()) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const match = value.match(/(?:^|\n)agentId:\s*([A-Za-z0-9][A-Za-z0-9_-]*)\b/u);
    return match?.[1] || null;
  }
  if (typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (typeof value.agentId === 'string' && value.agentId.trim()) return value.agentId.trim();
  if (typeof value.agent_id === 'string' && value.agent_id.trim()) return value.agent_id.trim();
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = responseAgentId(child, seen);
    if (found) return found;
  }
  return null;
}

export function postAgent({ root, event }) {
  if (!['Agent', 'Skill'].includes(event.tool_name)) return { exitCode: 0 };

  const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
  const invokedSkill = String(event.tool_input?.skill || '').trim();
  if (event.tool_name === 'Agent' && !isHarnessAgentType(requestedRaw)) return { exitCode: 0 };
  if (event.tool_name === 'Skill' && !isHarnessForkSkill(invokedSkill)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  const agentId = responseAgentId(event.tool_response);
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
  // Claude Code can return an async Agent launch result before SubagentStop.
  // Persist identity binding now; trustedHandoffAgentBindings still requires the
  // matching structured stop receipt before treating the run as completed.
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
    handoffPath: matchingStop?.handoffPath || dispatch.handoffPath,
    invocationTool: event.tool_name,
    cwd,
  });
  return { exitCode: 0 };
}
