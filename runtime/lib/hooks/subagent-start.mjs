import {
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
} from '../agent-evidence.mjs';
import { captureWorktreeBaseline } from '../git-evidence.mjs';
import { hookChangeId, hookRepoRoot } from '../hook-change.mjs';

export function subagentStart({ root, event }) {
  const observedRaw = String(event.agent_type || '').trim();
  if (!isHarnessAgentType(observedRaw)) return { exitCode: 0 };
  const cwd = event.cwd || root;
  const repoRoot = hookRepoRoot(root, event);
  const changeId = hookChangeId(repoRoot, event);
  if (!changeId || !event.agent_id) return { exitCode: 0 };
  const observedAgentType = normalizeAgentType(observedRaw);
  let statusBaseline;
  if (observedAgentType === 'enterprise-harness:implementer') {
    try {
      statusBaseline = captureWorktreeBaseline(cwd);
    } catch (error) {
      return {
        exitCode: 2,
        stderr: `BLOCK: implementer 无法在 SubagentStart 冻结 worktree baseline：${error.message}`,
      };
    }
  }
  appendAgentEvent(repoRoot, changeId, {
    kind: 'start',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType,
    rawObservedAgentType: observedRaw,
    lifecycle: 'isolated-context-started',
    ...(statusBaseline ? { statusBaseline } : {}),
    cwd,
  });
  return { exitCode: 0 };
}
