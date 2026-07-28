import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  readAgentEvents,
} from '../lib/agent-evidence.mjs';

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
  console.error('BLOCK: harness Agent PostToolUse requires active change, tool_use_id, and agentId');
  process.exit(2);
}
const dispatch = [...readAgentEvents(root, changeId)].reverse().find((item) => (
  item.kind === 'dispatch'
  && item.toolUseId === event.tool_use_id
  && item.requestedAgentType === normalizeAgentType(requestedRaw)
));
if (!dispatch) {
  console.error('BLOCK: Agent result has no matching scoped dispatch receipt');
  process.exit(2);
}
appendAgentEvent(root, changeId, {
  kind: 'dispatch-binding',
  sessionId: event.session_id,
  toolUseId: event.tool_use_id,
  agentId,
  requestedAgentType: normalizeAgentType(requestedRaw),
  rawRequestedAgentType: requestedRaw,
  cwd: event.cwd || root,
});
process.exit(0);
