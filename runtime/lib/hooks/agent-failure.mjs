import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';

export function agentFailure({ root, event }) {
  if (event.tool_name !== 'Agent') return { exitCode: 0 };
  const requested = normalizeAgentType(event.tool_input?.subagent_type);
  if (!isHarnessAgentType(requested)) return { exitCode: 0 };

  const changeId = activeChangeId(root);
  if (!changeId) return { exitCode: 0 };
  const dispatch = [...readAgentEvents(root, changeId)].reverse().find((item) => (
    item.kind === 'dispatch'
    && item.toolUseId === event.tool_use_id
    && item.requestedAgentType === requested
  ));
  appendAgentEvent(root, changeId, {
    kind: 'failure',
    errorCode: 'EH-AGENT-FAILURE-009',
    sessionId: event.session_id,
    toolUseId: event.tool_use_id,
    requestedAgentType: requested,
    runId: dispatch?.runId || null,
    behavior: dispatch?.behavior || null,
    failure: event.error || event.tool_error || 'Agent tool failed',
    cwd: event.cwd || root,
  });
  return {
    exitCode: 0,
    stderr: formatDiagnostic(
      'EH-AGENT-FAILURE-009',
      String(event.error || event.tool_error || 'Agent tool failed'),
      { changeId, runId: dispatch?.runId },
    ),
  };
}
