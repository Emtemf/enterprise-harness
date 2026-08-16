import { appendAgentEvent } from '../lib/agent-evidence.mjs';
import { v2ResultPath } from '../core/handoff-v2.mjs';

export function appendCompletedHandoffBinding(root, changeId, input, {
  agentId,
  sessionId = 'fixture-session',
} = {}) {
  const toolUseId = `tool-${input.runId}-${agentId}`;
  const common = {
    sessionId,
    runId: input.runId,
    behavior: input.behavior,
    handoffRole: input.role,
    parentRunId: input.parentRunId,
    cwd: root,
  };
  appendAgentEvent(root, changeId, {
    ...common,
    kind: 'dispatch',
    toolUseId,
    requestedAgentType: input.agent.type,
    handoffPath: input.runId,
  });
  appendAgentEvent(root, changeId, {
    ...common,
    kind: 'start',
    agentId,
    observedAgentType: input.agent.type,
  });
  appendAgentEvent(root, changeId, {
    ...common,
    kind: 'stop',
    agentId,
    observedAgentType: input.agent.type,
    handoffPath: v2ResultPath(root, changeId, input.runId, input.role),
  });
  appendAgentEvent(root, changeId, {
    ...common,
    kind: 'dispatch-binding',
    toolUseId,
    agentId,
    requestedAgentType: input.agent.type,
    handoffPath: v2ResultPath(root, changeId, input.runId, input.role),
  });
}
