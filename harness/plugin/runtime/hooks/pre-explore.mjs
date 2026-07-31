import { projectRoot, hasChangeTracking } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import {
  appendAgentEvent,
  boundHarnessAgent,
  normalizeAgentType,
  readAgentEvents,
  sha256,
} from '../lib/agent-evidence.mjs';
import {
  extractExplorationTargets,
  isExplorationTargetExempt,
} from '../lib/hook-targets.mjs';

const root = projectRoot();
if (!hasChangeTracking(root)) process.exit(0);
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf-8').trim();
if (!raw) process.exit(0);
let event;
try {
  event = JSON.parse(raw);
} catch (error) {
  console.error(`BLOCK [EH-HOOK-INPUT-017] invalid PreToolUse JSON: ${error.message}`);
  process.exit(2);
}

const toolName = String(event.tool_name || '');
const input = event.tool_input || {};
const bash = String(input.command || '');
const explorationBash = /(?:\brg\b|\bgrep\b|\bfind\b|\bcodegraph\b|src\/main\/java|src\/test\/java|openapi\/)/iu.test(bash);
const codegraphTool = /codegraph/iu.test(toolName) || (toolName === 'Bash' && /\bcodegraph\b/iu.test(bash));
const fallbackTool = ['Grep', 'Read', 'Glob'].includes(toolName) || (toolName === 'Bash' && explorationBash && !codegraphTool);
if (!codegraphTool && !fallbackTool) process.exit(0);
const targets = extractExplorationTargets(root, event);
if (targets.every((target) => isExplorationTargetExempt(root, target))) {
  process.exit(0);
}

const active = loadActiveChange(root);
if (!active.ok) {
  console.error('BLOCK: 业务代码探索需要 active change，并且必须在 enterprise-harness:code-explore subagent 中执行。');
  process.exit(2);
}
const agentId = String(event.agent_id || '').trim();
const binding = agentId && boundHarnessAgent(root, active.changeId, agentId, 'enterprise-harness:code-explore');
if (!binding) {
  console.error('BLOCK: 主 orchestrator 不得直接探索业务代码；必须使用 code-explore subagent，且当前事件没有绑定到 active enterprise-harness:code-explore。');
  process.exit(2);
}
if (codegraphTool) {
  appendAgentEvent(root, active.changeId, {
    kind: 'codegraph-attempt',
    sessionId: event.session_id,
    agentId,
    observedAgentType: normalizeAgentType(binding.start.observedAgentType),
    commandDigest: sha256(JSON.stringify({ toolName, input })),
    cwd: event.cwd || root,
  });
  process.exit(0);
}
const attempted = readAgentEvents(root, active.changeId).some((item) => (
  item.kind === 'codegraph-attempt' && item.agentId === agentId
));
if (!attempted) {
  console.error('BLOCK: code-explore fallback 前必须由同一 agent_id 产生 CodeGraph attempt 证据。');
  process.exit(2);
}
process.exit(0);
