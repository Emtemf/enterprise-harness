import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  isKnownBareAgentType,
  normalizeAgentType,
} from '../lib/agent-evidence.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try { event = JSON.parse(raw); } catch { process.exit(0); }
if (event.tool_name !== 'Agent') process.exit(0);

const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
if (isKnownBareAgentType(requestedRaw)) {
  console.error(
    `BLOCK: plugin Agent subtype must be scoped: enterprise-harness:${requestedRaw}`,
  );
  process.exit(2);
}
if (!isHarnessAgentType(requestedRaw)) process.exit(0);

const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId) {
  console.error('BLOCK: harness Agent dispatch requires an active change');
  process.exit(2);
}
appendAgentEvent(root, changeId, {
  kind: 'dispatch',
  sessionId: event.session_id,
  toolUseId: event.tool_use_id,
  requestedAgentType: normalizeAgentType(requestedRaw),
  rawRequestedAgentType: requestedRaw,
  cwd: event.cwd || root,
});
process.exit(0);
