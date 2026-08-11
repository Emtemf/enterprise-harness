import crypto from 'node:crypto';

const CAPABILITY_ALIASES = Object.freeze({
  'docs.resolve': ['resolve-library-id', 'resolve-library'],
  'docs.query': ['query-docs', 'get-library-docs'],
  'code.search': ['codegraph_search', 'code_search'],
  'code.explore': ['codegraph_explore', 'code_explore'],
  'code.impact': ['codegraph_impact', 'code_impact'],
  'code.callers': ['codegraph_callers', 'code_callers'],
  'code.callees': ['codegraph_callees', 'code_callees'],
});

export function capabilityAliases(capability) {
  return [...(CAPABILITY_ALIASES[capability] || [])];
}

export function resolveCapability(capability, availableTools = []) {
  const available = new Set(availableTools);
  return capabilityAliases(capability).find((name) => available.has(name)) || null;
}

export function digestMcpInput(input) {
  return crypto.createHash('sha256').update(JSON.stringify(input, Object.keys(input || {}).sort())).digest('hex');
}

export function createMcpEvidence({ agentId, provider, capability, input, success, durationMs = null, fallbackUsed = false }) {
  if (!['codegraph', 'context7'].includes(provider)) {
    throw new Error('EH-MCP-POLICY-001: provider must be codegraph or context7');
  }
  if (!capability || typeof success !== 'boolean') {
    throw new Error('EH-MCP-POLICY-001: capability and success are required');
  }
  return Object.freeze({
    schemaVersion: 1,
    agentId: agentId || null,
    provider,
    capability,
    inputDigest: digestMcpInput(input),
    success,
    fallbackUsed: fallbackUsed === true,
    durationMs,
    recordedAt: new Date().toISOString(),
  });
}

export const MCP_POLICY = Object.freeze({
  codegraph: Object.freeze({ primary: true, fallback: 'scoped-source-read', blockOn: ['architecture', 'api', 'data', 'security'] }),
  context7: Object.freeze({ primary: true, fallback: 'official-vendor-docs', blockOn: ['architecture', 'api', 'data', 'security'] }),
});
