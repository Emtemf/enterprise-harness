import { hasChangeTracking } from '../checks.mjs';
import {
  appendAgentEvent,
  normalizeAgentType,
  readAgentEvents,
  sha256,
  startedHarnessAgent,
} from '../agent-evidence.mjs';
import {
  extractExplorationTargets,
  isExplorationTargetExempt,
  hasUnboundedExplorationScope,
} from '../hook-targets.mjs';
import { loadHookChange, hookSessionId } from '../hook-change.mjs';
import { dedupGuard } from '../hook-dedup.mjs';

export function preExplore({ root, event }) {
  if (!hasChangeTracking(root)) return { exitCode: 0 };

  const toolName = String(event.tool_name || '');
  const input = event.tool_input || {};
  const bash = String(input.command || '');
  // 探索判定必须看"命令做什么"，而不是"命令里出现了什么字符串"。
  // 早期版本直接匹配裸路径（src/main/java 等），导致 `git commit` 的 heredoc 消息
  // 里提到受治理路径就被当成探索并 BLOCK——提交自己的修复都会被自己的网关拦住。
  const READ_COMMAND = /(?:^|[;&|]\s*|\$\(\s*)(?:rg|grep|egrep|fgrep|find|ls|cat|head|tail|sed|awk|codegraph)\b/u;
  const explorationBash = READ_COMMAND.test(bash);
  const CODEGRAPH_EXPLORATION_MCP = /(?:^|__)codegraph_(?:explore|search|callers|callees|impact|node|files)$/u;
  // status 只说明索引服务存活，不能替代针对需求的代码探索；它若被当作 attempt，
  // code-explore 可先查一次 status 再直接 fallback 到 Grep/Read，绕过 CodeGraph-first。
  const codegraphTool = (toolName === 'Bash' && /(?:^|[;&|]\s*|\$\(\s*)codegraph\s+(?:explore|search|callers|callees|impact|node|files)\b/u.test(bash))
    || CODEGRAPH_EXPLORATION_MCP.test(toolName);
  // Bash codegraph 与 MCP CodeGraph 都是一次必须落账的 attempt。
  const fallbackTool = ['Grep', 'Read', 'Glob'].includes(toolName) || (toolName === 'Bash' && explorationBash && !codegraphTool);
  if (!codegraphTool && !fallbackTool) return { exitCode: 0 };
  if (dedupGuard('pre-explore', event.tool_use_id, event.cwd)) return { exitCode: 0 };
  const targets = extractExplorationTargets(root, event);
  // CodeGraph 查询通常带的是符号而非文件路径，不能因其 token 不在受治理目录就豁免；
  // 必须先记录同一 agent 的 attempt，后续 fallback 才有可验证的前置证据。
  // 其他工具没有可解析目标且不属于全仓 Grep/Glob 时，才可按所有目标豁免。
  const unbounded = hasUnboundedExplorationScope(root, event);
  if (!codegraphTool && !unbounded && targets.every((target) => isExplorationTargetExempt(root, target))) {
    return { exitCode: 0 };
  }

  const active = loadHookChange(root, event);
  if (!active.ok) {
    return {
      exitCode: 2,
      stderr: 'BLOCK: 业务代码探索需要 active change，并且必须在 enterprise-harness:code-explore subagent 中执行。',
    };
  }
  const agentId = String(event.agent_id || '').trim();
  // The gate runs while the subagent is still executing, so it can only rely on
  // evidence that exists mid-flight. `dispatch-binding` is written by
  // PostToolUse:Agent — after the subagent exits — so requiring it here made a
  // code-explore subagent unable to pass its own gate.
  const binding = agentId && startedHarnessAgent(root, active.changeId, agentId, 'enterprise-harness:code-explore');
  if (!binding) {
    return {
      exitCode: 2,
      stderr: 'BLOCK: 主 orchestrator 不得直接探索业务代码；必须使用 code-explore subagent，且当前事件没有绑定到 active enterprise-harness:code-explore。',
    };
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
    return { exitCode: 0 };
  }
  const attempted = readAgentEvents(root, active.changeId).some((item) => (
    item.kind === 'codegraph-attempt' && item.agentId === agentId
  ));
  if (!attempted) {
    return {
      exitCode: 2,
      stderr: 'BLOCK: code-explore fallback 前必须由同一 agent_id 产生 CodeGraph attempt 证据。',
    };
  }
  return { exitCode: 0 };
}
