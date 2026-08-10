import {
  activeChangeId,
  appendAgentEvent,
  gitCommonDir,
  isHarnessAgentType,
  normalizeAgentType,
} from '../agent-evidence.mjs';
import path from 'node:path';

export function subagentStart({ root, event }) {
  const observedRaw = String(event.agent_type || '').trim();
  if (!isHarnessAgentType(observedRaw)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const commonDir = gitCommonDir(cwd);
  const repoRoot = path.resolve(commonDir, '..');
  const changeId = activeChangeId(repoRoot);
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
