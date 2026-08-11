import assert from 'node:assert/strict';
import { capabilityAliases, resolveCapability, createMcpEvidence, MCP_POLICY } from '../lib/mcp-policy.mjs';

assert.deepEqual(capabilityAliases('docs.query'), ['query-docs', 'get-library-docs']);
assert.equal(resolveCapability('docs.query', ['get-library-docs']), 'get-library-docs');
assert.equal(resolveCapability('docs.query', ['unknown']), null);
const evidence = createMcpEvidence({ provider: 'context7', capability: 'docs.query', input: { library: 'spring', version: '3.4' }, success: true });
assert.equal(evidence.inputDigest.length, 64);
assert.equal(MCP_POLICY.context7.primary, true);
assert.throws(() => createMcpEvidence({ provider: 'other', capability: 'docs.query', input: {}, success: true }), /EH-MCP-POLICY-001/u);
console.log('PASS mcp-policy-v5 verify');
