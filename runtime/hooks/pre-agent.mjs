import {
  activeChangeId,
  appendAgentEvent,
  isHarnessAgentType,
  normalizeAgentType,
} from '../lib/agent-evidence.mjs';
import {
  loadHandoffInput,
  parseHandoffInputMarker,
} from '../lib/handoff.mjs';
import { formatDiagnostic } from '../lib/diagnostics.mjs';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`BLOCK [EH-HOOK-INPUT-017] invalid Agent PreToolUse JSON: ${error.message}`);
  process.exit(2);
}
if (event.tool_name !== 'Agent') process.exit(0);

// Agent types arrive scoped (`enterprise-harness:code-explore`) when loaded as a plugin and
// bare (`code-explore`) when the same definitions load from this repo's own .claude/agents.
// Both spellings denote the same governed agent, so normalize instead of demanding a prefix
// the local registry cannot resolve — the handoff evidence below is what actually gates.
const requestedRaw = String(event.tool_input?.subagent_type || '').trim();
if (!isHarnessAgentType(requestedRaw)) process.exit(0);

const root = process.cwd();
const changeId = activeChangeId(root);
if (!changeId) {
  console.error(formatDiagnostic(
    'EH-HANDOFF-INPUT-001',
    'harness Agent dispatch requires an active change',
  ));
  process.exit(2);
}
const marker = parseHandoffInputMarker(event.tool_input?.prompt);
if (!marker) {
  console.error(formatDiagnostic(
    'EH-HANDOFF-INPUT-001',
    'Agent prompt must contain HANDOFF_INPUT=<canonical input.json path>',
    { changeId },
  ));
  process.exit(2);
}
const loaded = loadHandoffInput(root, marker, {
  changeId,
  agentType: requestedRaw,
});
if (!loaded.ok) {
  console.error(formatDiagnostic(
    'EH-HANDOFF-SCHEMA-002',
    loaded.problems.join('; '),
    { changeId, runId: loaded.envelope?.runId },
  ));
  process.exit(2);
}
appendAgentEvent(root, changeId, {
  kind: 'dispatch',
  sessionId: event.session_id,
  toolUseId: event.tool_use_id,
  requestedAgentType: normalizeAgentType(requestedRaw),
  rawRequestedAgentType: requestedRaw,
  runId: loaded.envelope.runId,
  behavior: loaded.envelope.behavior,
  handoffRole: loaded.envelope.role,
  handoffPath: marker,
  parentRunId: loaded.envelope.parentRunId,
  preloadedSkill: loaded.envelope.agent.skill,
  cwd: event.cwd || root,
});
process.exit(0);
