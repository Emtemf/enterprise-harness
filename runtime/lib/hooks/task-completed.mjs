import {
  readAgentEvents,
} from '../agent-evidence.mjs';
import { hookChangeId } from '../hook-change.mjs';

export function taskCompleted({ root, event = {} }) {
  // v6: agent lifecycle events are telemetry only. Durable stage artifacts,
  // self-checks, independent reviews, and TECPC envelopes are the correctness
  // evidence; a host TaskCompleted callback must never block a worker from
  // returning control to the main orchestrator.
  const changeId = hookChangeId(root, event);
  if (!changeId) return { exitCode: 0 };

  const events = readAgentEvents(root, changeId);
  const latestExecution = [...events].reverse().find((item) => (
    item.kind === 'dispatch' && item.handoffRole === 'execute'
  ));
  if (latestExecution) {
    // Keep this lookup deliberately side-effect free for diagnostics/trace.
    void latestExecution.runId;
  }
  return { exitCode: 0 };
}
