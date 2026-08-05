import { projectRoot, hasChangeTracking } from '../lib/checks.mjs';
import { loadActiveChange } from '../lib/gates.mjs';
import {
  appendAgentEvent,
  normalizeAgentType,
  readAgentEvents,
  sha256,
  startedHarnessAgent,
} from '../lib/agent-evidence.mjs';
import {
  extractExplorationTargets,
  isExplorationTargetExempt,
  hasUnboundedExplorationScope,
} from '../lib/hook-targets.mjs';
import { dedupGuard } from '../lib/hook-dedup.mjs';

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
// 探索判定必须看"命令做什么"，而不是"命令里出现了什么字符串"。
// 早期版本直接匹配裸路径（src/main/java 等），导致 `git commit` 的 heredoc 消息
// 里提到受治理路径就被当成探索并 BLOCK——提交自己的修复都会被自己的网关拦住。
const READ_COMMAND = /(?:^|[;&|]\s*|\$\(\s*)(?:rg|grep|egrep|fgrep|find|ls|cat|head|tail|sed|awk|codegraph)\b/u;
const explorationBash = READ_COMMAND.test(bash);
const codegraphTool = /codegraph/iu.test(toolName) || (toolName === 'Bash' && /(?:^|[;&|]\s*|\$\(\s*)codegraph\b/u.test(bash));
// Only an MCP CodeGraph call genuinely has no path to match; a Bash command
// merely mentioning the word still carries real path tokens, so it keeps the
// normal exemption and must not be forced through the gate.
const codegraphMcpTool = /codegraph/iu.test(toolName);
const fallbackTool = ['Grep', 'Read', 'Glob'].includes(toolName) || (toolName === 'Bash' && explorationBash && !codegraphTool);
if (!codegraphTool && !fallbackTool) process.exit(0);
if (dedupGuard('pre-explore', event.tool_use_id, event.cwd)) process.exit(0);
const targets = extractExplorationTargets(root, event);
// A CodeGraph query names symbols, not paths, so it has no governed target to
// match. Exempting it here would skip recording the attempt that the fallback
// branch below then demands — making the required evidence impossible to produce.
// 无作用域的 Grep/Glob（不带 path/glob）等于全仓扫描，必然触及受治理代码；
// 它没有可解析目标，因此不能走 every() 豁免，否则整个网关被绕过。
const unbounded = hasUnboundedExplorationScope(root, event);
if (!codegraphMcpTool && !unbounded && targets.every((target) => isExplorationTargetExempt(root, target))) {
  process.exit(0);
}

const active = loadActiveChange(root);
if (!active.ok) {
  console.error('BLOCK: 业务代码探索需要 active change，并且必须在 enterprise-harness:code-explore subagent 中执行。');
  process.exit(2);
}
const agentId = String(event.agent_id || '').trim();
// The gate runs while the subagent is still executing, so it can only rely on
// evidence that exists mid-flight. `dispatch-binding` is written by
// PostToolUse:Agent — after the subagent exits — so requiring it here made a
// code-explore subagent unable to pass its own gate.
const binding = agentId && startedHarnessAgent(root, active.changeId, agentId, 'enterprise-harness:code-explore');
if (!binding) {
  console.error('BLOCK: 主 orchestrator 不得直接探索业务代码；必须使用 code-explore subagent，且当前事件没有绑定到 active enterprise-harness:code-explore。');
  process.exit(2);
}
if (codegraphTool) {
  appendAgentEvent(root, active.changeId, {
    kind: 'codegraph-attempt',
    sessionId: event.session_id,
    agentId,
    observedAgentType: normalizeAgentType(binding.observedAgentType),
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
