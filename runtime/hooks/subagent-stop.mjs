import {
  activeChangeId,
  appendAgentEvent,
  gitCommonDir,
  isHarnessAgentType,
  normalizeAgentType,
  sha256,
  readAgentEvents,
} from '../lib/agent-evidence.mjs';
import {
  loadHandoffInput,
  parseHandoffResult,
  persistHandoffResult,
  validateHandoffResult,
} from '../lib/handoff.mjs';
import { formatDiagnostic } from '../lib/diagnostics.mjs';
import path from 'node:path';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`BLOCK [EH-HOOK-INPUT-017] invalid SubagentStop JSON: ${error.message}`);
  process.exit(2);
}

const observedRaw = String(event.agent_type || '').trim();
if (!isHarnessAgentType(observedRaw)) process.exit(0);
const normalized = normalizeAgentType(observedRaw);
const message = String(event.last_assistant_message || '');
const cwd = event.cwd || process.cwd();
// When the subagent runs in a worktree, process.cwd() is the worktree dir but
// handoff inputs and agent events live in the main repo. Resolve via git common dir.
const commonDir = gitCommonDir(cwd);
const root = path.resolve(commonDir, '..');
const changeId = activeChangeId(root);
if (!changeId || !event.agent_id) process.exit(0);

const parsed = parseHandoffResult(message);
const runId = parsed.value?.runId || null;
const dispatch = runId
  ? [...readAgentEvents(root, changeId)].reverse().find((item) => (
    item.kind === 'dispatch'
    && item.runId === runId
    && item.requestedAgentType === normalized
  ))
  : null;
const loaded = dispatch
  ? loadHandoffInput(root, dispatch.handoffPath, {
    changeId,
    agentType: normalized,
  })
  : { ok: false, problems: ['no matching dispatch for result runId'] };
const resultProblems = [
  ...(parsed.problems || []),
  ...(loaded.problems || []),
  ...(parsed.ok && loaded.ok
    ? validateHandoffResult(parsed.value, loaded.envelope, normalized)
    : []),
];

if (resultProblems.length > 0) {
  appendAgentEvent(root, changeId, {
    kind: 'violation',
    violation: 'malformed-subagent-result',
    sessionId: event.session_id,
    agentId: event.agent_id,
    observedAgentType: normalized,
    rawObservedAgentType: observedRaw,
    runId,
    errorCode: 'EH-SUBAGENT-RESULT-004',
    problems: resultProblems,
    transcriptDigest: sha256(message),
    cwd,
  });
  if (event.stop_hook_active) process.exit(0);
  process.stdout.write(`${JSON.stringify({
    decision: 'block',
    reason: formatDiagnostic(
      'EH-SUBAGENT-RESULT-004',
      resultProblems.join('; '),
      { changeId, runId },
    ),
  })}\n`);
  process.exit(0);
}

const resultPath = persistHandoffResult(root, loaded.envelope, parsed.value);
appendAgentEvent(root, changeId, {
  kind: 'stop',
  sessionId: event.session_id,
  agentId: event.agent_id,
  observedAgentType: normalized,
  rawObservedAgentType: observedRaw,
  runId,
  behavior: loaded.envelope.behavior,
  handoffRole: loaded.envelope.role,
  handoffPath: resultPath,
  parentRunId: loaded.envelope.parentRunId,
  verdict: parsed.value.verdict || null,
  transcriptDigest: sha256(message),
  cwd,
});
process.exit(0);
