import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';
import { isHarnessForkSkill } from '../harness-skill-invocation.mjs';

export function agentFailure({ root, event }) {
  if (!['Agent', 'Skill'].includes(event.tool_name)) return { exitCode: 0 };
  let requested = normalizeAgentType(event.tool_input?.subagent_type);
  const invokedSkill = String(event.tool_input?.skill || '').trim();
  if (event.tool_name === 'Agent' && !isHarnessAgentType(requested)) return { exitCode: 0 };
  if (event.tool_name === 'Skill' && !isHarnessForkSkill(invokedSkill)) return { exitCode: 0 };

  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  if (!changeId) return { exitCode: 0 };
  const dispatch = [...readAgentEvents(repoRoot, changeId)].reverse().find((item) => (
    item.kind === 'dispatch'
    && item.toolUseId === event.tool_use_id
    && (event.tool_name === 'Skill' || item.requestedAgentType === requested)
  ));
  if (event.tool_name === 'Skill' && dispatch) requested = dispatch.requestedAgentType;
  appendAgentEvent(repoRoot, changeId, {
    kind: 'failure',
    errorCode: 'EH-AGENT-FAILURE-009',
    sessionId: event.session_id,
    toolUseId: event.tool_use_id,
    requestedAgentType: requested,
    runId: dispatch?.runId || null,
    behavior: dispatch?.behavior || null,
    invocationTool: event.tool_name,
    failure: event.error || event.tool_error || `${event.tool_name} tool failed`,
    cwd: event.cwd || root,
  });
  return {
    exitCode: 0,
    stderr: formatDiagnostic(
      'EH-AGENT-FAILURE-009',
      String(event.error || event.tool_error || `${event.tool_name} tool failed`),
      { changeId, runId: dispatch?.runId },
    ),
  };
}
