import assert from 'node:assert/strict';
import { classifyChange } from '../lib/workflow.mjs';

const classified = classifyChange({
  tier: 'L3',
  impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes' },
});
assert.equal(classified.tier, 'L3');
assert.deepEqual(classified.impact, {
  api: true,
  data: true,
  architecture: true,
  security: false,
});
assert.deepEqual(classified.requiredReviews, ['design', 'api', 'data', 'architecture', 'final']);
assert.equal(classified.workflowTopology, 'clarify -> design -> plan -> implement -> verify -> archive');

const minimal = classifyChange({ tier: 'L1', impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' } });
assert.deepEqual(minimal.requiredReviews, ['design', 'final']);
assert.equal(minimal.impact.security, false);

assert.throws(() => classifyChange(null), /EH-CLASSIFY-001/u);
console.log('PASS workflow-classify verify');
