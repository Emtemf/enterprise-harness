import assert from 'node:assert/strict';
import { artifactDependencies, deriveStaleArtifacts, controlledRewind } from '../lib/artifacts.mjs';

const graph = artifactDependencies();
assert.deepEqual(graph.design, ['requirements']);
assert.deepEqual(graph.testCases, ['requirements', 'design']);
assert.deepEqual(graph.plan, ['design', 'testCases']);
assert.deepEqual(graph.validation, ['requirements', 'design', 'testCases', 'plan', 'evidence']);
const stale = deriveStaleArtifacts(graph, new Set(['requirements']));
assert.deepEqual(stale, ['design', 'evidence', 'plan', 'testCases', 'validation']);
const rewind = controlledRewind({
  currentStage: 'verify',
  staleArtifacts: stale,
  targetStage: 'design',
});
assert.equal(rewind.stage, 'design');
assert.deepEqual(rewind.invalidated, stale);
assert.equal(rewind.historyPreserved, true);
console.log('PASS artifact-dependency-v5 verify');
