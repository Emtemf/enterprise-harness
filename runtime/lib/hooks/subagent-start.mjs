import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
} from '../agent-evidence.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';

export function subagentStart({ root, event }) {
  const observedRaw = String(event.agent_type || '').trim();
  if (!isHarnessAgentType(observedRaw)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  if (!changeId || !event.agent_id) return { exitCode: 0 };
  appendAgentEvent(repoRoot, changeId, {
    kind: 'start',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType: normalizeAgentType(observedRaw),
    rawObservedAgentType: observedRaw,
    lifecycle: 'isolated-context-started',
    cwd,
  });
  return { exitCode: 0 };
}
