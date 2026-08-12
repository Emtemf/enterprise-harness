import { loadHookChange } from '../hook-change.mjs';
import { appendAgentEvent, sha256 } from '../agent-evidence.mjs';
import { dedupGuard } from '../hook-dedup.mjs';

const PLUGIN_SCOPE = 'mcp__plugin_enterprise-harness_';

function providerFor(toolName) {
  if (toolName.startsWith('mcp__codegraph__')) return 'codegraph';
  if (toolName.startsWith('mcp__context7__')) return 'context7';
  if (toolName.startsWith(`${PLUGIN_SCOPE}codegraph__`)) return 'codegraph';
  if (toolName.startsWith(`${PLUGIN_SCOPE}context7__`)) return 'context7';
  return null;
}

function capabilityFor(toolName, provider) {
  const prefixes = [`mcp__${provider}__`, `${PLUGIN_SCOPE}${provider}__`];
  for (const prefix of prefixes) {
    if (toolName.startsWith(prefix)) return toolName.slice(prefix.length);
  }
  return toolName;
}

export function researchEvidence({ root, event, success }) {
  const toolName = String(event.tool_name || '');
  const provider = providerFor(toolName);
  if (!provider) return { exitCode: 0 };
  if (dedupGuard('research-evidence', event.tool_use_id, event.cwd)) return { exitCode: 0 };

  const active = loadHookChange(root, event);
  if (!active.ok) return { exitCode: 0 };

  const input = event.tool_input && typeof event.tool_input === 'object' ? event.tool_input : {};
  appendAgentEvent(root, active.changeId, {
    kind: 'research-evidence',
    provider,
    capability: capabilityFor(toolName, provider),
    inputDigest: sha256(JSON.stringify(input)),
    success: success === true,
    agentId: event.agent_id || null,
    sessionId: event.session_id || null,
    toolUseId: event.tool_use_id || null,
    cwd: event.cwd || root,
    responseDigest: event.tool_response ? sha256(JSON.stringify(event.tool_response)) : null,
    errorDigest: event.error ? sha256(String(event.error)) : null,
  });
  return { exitCode: 0 };
}
