import {
  activeChangeId,
  readAgentEvents,
} from '../lib/agent-evidence.mjs';
import { formatDiagnostic } from '../lib/diagnostics.mjs';

const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId) process.exit(0);

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
if (!latestExecution) process.exit(0);

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
  console.error(formatDiagnostic(
    'EH-CHECKER-REQUIRED-005',
    latestCheck?.verdict === 'block'
      ? `checker blocked ${latestExecution.behavior}`
      : `independent checker has not accepted ${latestExecution.behavior}`,
    { changeId, runId: latestExecution.runId },
  ));
  process.exit(2);
}
process.exit(0);
