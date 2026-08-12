import {
  readAgentEvents,
} from '../agent-evidence.mjs';
import { formatDiagnostic } from '../diagnostics.mjs';
import { hookChangeId } from '../hook-change.mjs';

export function taskCompleted({ root, event = {} }) {
  const changeId = hookChangeId(root, event);
  if (!changeId) return { exitCode: 0 };

  const events = readAgentEvents(root, changeId);
  const supersededRunIds = new Set();
  for (const event of events) {
    if (event.kind === 'failure' && event.runId) supersededRunIds.add(event.runId);
    if (event.kind === 'dispatch' && event.runId) supersededRunIds.delete(event.runId);
  }
  const latestExecution = [...events].reverse().find((event) => (
    event.kind === 'dispatch'
    && event.handoffRole === 'execute'
    && !supersededRunIds.has(event.runId)
  ));
  if (!latestExecution) return { exitCode: 0 };

  const executionStopped = events.some((event) => (
    event.kind === 'stop'
    && event.runId === latestExecution.runId
  ));
  const latestCheck = [...events].reverse().find((event) => (
    event.kind === 'stop'
    && event.handoffRole === 'check'
    && event.parentRunId === latestExecution.runId
  ));

  if (!executionStopped || !latestCheck || !['pass', 'advisory'].includes(latestCheck.verdict)) {
    return {
      exitCode: 2,
      stderr: formatDiagnostic(
        'EH-CHECKER-REQUIRED-005',
        latestCheck?.verdict === 'block'
          ? `checker blocked ${latestExecution.behavior}`
          : `independent checker has not accepted ${latestExecution.behavior}`,
        { changeId, runId: latestExecution.runId },
      ),
    };
  }
  return { exitCode: 0 };
}
