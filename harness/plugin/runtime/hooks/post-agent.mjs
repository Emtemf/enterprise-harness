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
try { event = JSON.parse(raw); } catch { process.exit(0); }
if (event.tool_name !== 'Agent') process.exit(0);

const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
if (!isHarnessAgentType(requestedRaw)) process.exit(0);
const root = process.cwd();
const changeId = activeChangeId(root);
const agentId = event.tool_response?.agentId || event.tool_response?.agent_id;
if (!changeId || !event.tool_use_id || !agentId) {
  console.error(formatDiagnostic(
    'EH-AGENT-BINDING-003',
    'PostToolUse requires active change, tool_use_id, and agentId',
    { changeId },
  ));
  process.exit(2);
}
const dispatch = [...readAgentEvents(root, changeId)].reverse().find((item) => (
  item.kind === 'dispatch'
  && item.toolUseId === event.tool_use_id
  && item.requestedAgentType === normalizeAgentType(requestedRaw)
));
if (!dispatch) {
  console.error(formatDiagnostic(
    'EH-AGENT-BINDING-003',
    'Agent result has no matching scoped dispatch receipt',
    { changeId },
  ));
  process.exit(2);
}
const matchingStop = [...readAgentEvents(root, changeId)].reverse().find((item) => (
  item.kind === 'stop'
  && item.agentId === agentId
  && item.runId === dispatch.runId
  && item.observedAgentType === dispatch.requestedAgentType
));
if (!matchingStop) {
  console.error(formatDiagnostic(
    'EH-AGENT-BINDING-003',
    'Agent result has no matching structured SubagentStop receipt',
    { changeId, runId: dispatch.runId },
  ));
  process.exit(2);
}
appendAgentEvent(root, changeId, {
  kind: 'dispatch-binding',
  sessionId: event.session_id,
  toolUseId: event.tool_use_id,
  agentId,
  requestedAgentType: normalizeAgentType(requestedRaw),
  rawRequestedAgentType: requestedRaw,
  runId: dispatch.runId,
  behavior: dispatch.behavior,
  handoffRole: dispatch.handoffRole,
  handoffPath: matchingStop.handoffPath,
  cwd: event.cwd || root,
});
process.exit(0);
