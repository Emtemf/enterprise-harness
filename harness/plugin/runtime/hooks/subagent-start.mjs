import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
} from '../lib/agent-evidence.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try { event = JSON.parse(raw); } catch { process.exit(0); }

const observedRaw = String(event.agent_type || '').trim();
if (!isHarnessAgentType(observedRaw)) process.exit(0);
const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId || !event.agent_id) process.exit(0);
appendAgentEvent(root, changeId, {
  kind: 'start',
  sessionId: event.session_id,
  agentId: event.agent_id,
  observedAgentType: normalizeAgentType(observedRaw),
  rawObservedAgentType: observedRaw,
  lifecycle: 'isolated-context-started',
  cwd: event.cwd || root,
});
process.exit(0);
