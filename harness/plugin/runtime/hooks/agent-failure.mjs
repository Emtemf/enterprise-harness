import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../lib/agent-evidence.mjs';
import { formatDiagnostic } from '../lib/diagnostics.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`WARN [EH-HOOK-INPUT-017] invalid Agent failure JSON: ${error.message}`);
  process.exit(0);
}
if (event.tool_name !== 'Agent') process.exit(0);
const requested = normalizeAgentType(event.tool_input?.subagent_type);
if (!isHarnessAgentType(requested)) process.exit(0);

const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId) process.exit(0);
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
console.error(formatDiagnostic(
  'EH-AGENT-FAILURE-009',
  String(event.error || event.tool_error || 'Agent tool failed'),
  { changeId, runId: dispatch?.runId },
));
process.exit(0);
