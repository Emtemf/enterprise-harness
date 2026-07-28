import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
  sha256,
} from '../lib/agent-evidence.mjs';

function resultIsStructured(agentType, message) {
  if (agentType === 'enterprise-harness:code-explore') {
    return [
      /Exploration Packet/i,
      /Scope/i,
      /CodeGraph/i,
      /Findings/i,
      /Evidence/i,
    ].every((pattern) => pattern.test(message));
  }
  if (agentType === 'enterprise-harness:tdd-executor') {
    return [
      /\btask[- ]?id\b/i,
      /\bworktree\b/i,
      /\breceipt/i,
      /\bcommit\b/i,
      /\bRED\b/,
      /\bGREEN\b/,
      /\bREFACTOR\b/,
    ].every((pattern) => pattern.test(message));
  }
  return message.trim().length > 0;
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try { event = JSON.parse(raw); } catch { process.exit(0); }

const observedRaw = String(event.agent_type || '').trim();
if (!isHarnessAgentType(observedRaw)) process.exit(0);
const normalized = normalizeAgentType(observedRaw);
const message = String(event.last_assistant_message || '');
const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId || !event.agent_id) process.exit(0);

if (!resultIsStructured(normalized, message)) {
  appendAgentEvent(root, changeId, {
    kind: 'violation',
    violation: 'malformed-subagent-result',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType: normalized,
    rawObservedAgentType: observedRaw,
    transcriptDigest: sha256(message),
    cwd: event.cwd || root,
  });
  if (event.stop_hook_active) process.exit(0);
  process.stdout.write(`${JSON.stringify({
    decision: 'block',
    reason: `structured ${normalized} result is required before stop`,
  })}\n`);
  process.exit(0);
}

appendAgentEvent(root, changeId, {
  kind: 'stop',
  sessionId: event.session_id,
  agentId: event.agent_id,
  observedAgentType: normalized,
  rawObservedAgentType: observedRaw,
  transcriptDigest: sha256(message),
  cwd: event.cwd || root,
});
process.exit(0);
