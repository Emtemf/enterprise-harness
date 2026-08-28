import assert from 'node:assert/strict';
import { agentForV2Handoff } from '../core/handoff-agent.mjs';

assert.deepEqual(
  agentForV2Handoff('clarify', 'clarify.explore-code', 'execute'),
  { type: 'enterprise-harness:code-explore', skill: 'explore-code' },
);
assert.deepEqual(
  agentForV2Handoff('clarify', 'clarify.research-docs', 'execute'),
  { type: 'enterprise-harness:doc-research', skill: 'research-docs' },
);
assert.deepEqual(
  agentForV2Handoff('design', 'design.produce', 'execute'),
  { type: 'enterprise-harness:artifact-worker', skill: 'design' },
);
assert.deepEqual(
  agentForV2Handoff('design', 'design.test-cases', 'execute'),
  { type: 'enterprise-harness:test-design-worker', skill: 'test-design' },
);
assert.deepEqual(
  agentForV2Handoff('implement', 'implement.task', 'execute'),
  { type: 'enterprise-harness:implementer', skill: 'implement' },
);
assert.deepEqual(
  agentForV2Handoff('verify', 'review', 'check'),
  { type: 'enterprise-harness:reviewer', skill: 'review' },
);
assert.throws(
  () => agentForV2Handoff('route', 'route.decide', 'execute'),
  /EH-HANDOFF-STAGE-001/u,
);

console.log('PASS handoff-agent-routing verify');
