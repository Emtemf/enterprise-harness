import {
  activeChangeId,
  appendAgentEvent,
  gitCommonDir,
  isHarnessAgentType,
  normalizeAgentType,
} from '../lib/agent-evidence.mjs';
import path from 'node:path';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`BLOCK [EH-HOOK-INPUT-017] invalid SubagentStart JSON: ${error.message}`);
  process.exit(2);
}

const observedRaw = String(event.agent_type || '').trim();
if (!isHarnessAgentType(observedRaw)) process.exit(0);
const cwd = event.cwd || process.cwd();
const commonDir = gitCommonDir(cwd);
const root = path.resolve(commonDir, '..');
const changeId = activeChangeId(root);
if (!changeId || !event.agent_id) process.exit(0);
appendAgentEvent(root, changeId, {
  kind: 'start',
  sessionId: event.session_id,
  agentId: event.agent_id,
  observedAgentType: normalizeAgentType(observedRaw),
  rawObservedAgentType: observedRaw,
  lifecycle: 'isolated-context-started',
  cwd,
});
process.exit(0);
