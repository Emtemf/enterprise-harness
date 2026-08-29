import assert from 'node:assert/strict';
import { artifactNameForPath, invalidateStateArtifacts } from '../lib/artifacts.mjs';

assert.equal(artifactNameForPath('requirements.md'), 'requirements');
assert.equal(artifactNameForPath('design.md'), 'design');
assert.equal(artifactNameForPath('test-cases.md'), 'testCases');
assert.equal(artifactNameForPath('tasks.md'), 'plan');
assert.equal(artifactNameForPath('evidence/tooling.md'), 'evidence');
assert.equal(artifactNameForPath('evidence\\tooling.md'), 'evidence');
assert.equal(artifactNameForPath('src/main/java/App.java'), null);

const state = {
  schemaVersion: 5,
  dependencies: {
    requirements: [],
    design: ['requirements'],
    testCases: ['requirements', 'design'],
    plan: ['design', 'testCases'],
    evidence: ['plan'],
    validation: ['requirements', 'design', 'plan', 'evidence'],
  },
  artifacts: { requirements: { status: 'fresh' }, design: { status: 'fresh' } },
  validation: { status: 'fresh', digest: 'digest', validatedAt: '2026-08-11' },
};
const next = invalidateStateArtifacts(state, ['requirements']);
assert.deepEqual(next.artifacts.requirements.invalidatedBy, ['requirements']);
assert.equal(next.artifacts.design.status, 'stale');
assert.equal(next.artifacts.testCases.status, 'stale');
assert.equal(next.artifacts.plan.status, 'stale');
assert.equal(next.artifacts.evidence.status, 'stale');
assert.equal(next.artifacts.validation.status, 'stale');
assert.equal(next.validation.digest, null);
assert.equal(state.artifacts.design.status, 'fresh');
console.log('PASS artifact-invalidation-state verify');
