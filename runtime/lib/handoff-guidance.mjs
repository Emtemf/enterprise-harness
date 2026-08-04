import { loadBehaviorRegistry } from './handoff.mjs';
import { normalizeAgentType } from './agent-evidence.mjs';

// pre-agent refuses any dispatch whose prompt lacks HANDOFF_INPUT. The registry
// already knows which behavior each agent serves, so the refusal can name the
// exact command instead of leaving the caller to guess a behavior string.

export function suggestHandoffCommand(root, agentType, changeId) {
  const normalized = normalizeAgentType(String(agentType || '').trim());
  if (!normalized) return null;

  let registry;
  try {
    registry = loadBehaviorRegistry(root);
  } catch {
    return null;
  }

  const matches = [];
  for (const [behavior, spec] of Object.entries(registry?.behaviors || {})) {
    const executor = normalizeAgentType(spec.executor || spec.executorAgent || '');
    const checker = normalizeAgentType(spec.checker || spec.checkerAgent || '');
    if (executor === normalized) matches.push({ behavior, stage: spec.stage, role: 'execute' });
    else if (checker === normalized) matches.push({ behavior, stage: spec.stage, role: 'check' });
  }
  if (matches.length === 0) return null;

  const [primary, ...alternatives] = matches;
  const change = changeId || '<change-id>';
  const tail = primary.role === 'check' ? 'check <executor-run-id>' : 'execute';
  return {
    ...primary,
    alternatives: alternatives.map((item) => item.behavior),
    command: `enterprise-harness handoff create ${change} ${primary.stage} ${primary.behavior} ${tail}`,
  };
}

export function formatHandoffGuidance(suggestion) {
  if (!suggestion) return null;
  const parts = [`先运行：${suggestion.command}`];
  parts.push('再把输出的 HANDOFF_INPUT=<path> 行原样放进 Agent prompt。');
  if (suggestion.alternatives.length > 0) {
    parts.push(`该 agent 也服务于 ${suggestion.alternatives.join('、')}；若目标不同请改用对应 behavior。`);
  }
  return parts.join(' ');
}
