import assert from 'node:assert/strict';
import { recommendNextEntry } from '../lib/workflow.mjs';

const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/workflow-next-entry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

try {
  assert.equal(recommendNextEntry('clarify'), '/harness-intake');
  assert.equal(recommendNextEntry('route'), '/harness-intake');
  assert.equal(recommendNextEntry('design'), '/harness-design');
  assert.equal(recommendNextEntry('plan'), '/harness-plan');
  assert.equal(recommendNextEntry('tdd'), '/harness-tdd');
  assert.equal(recommendNextEntry('verify'), '/harness-verify');
  assert.equal(recommendNextEntry('archive'), '/harness');
} catch (error) {
  if (mode === 'red') {
    console.log('Red precondition observed: workflow next entry mapping is currently broken.');
    process.exit(0);
  }
  console.error(`Expected workflow next entry mapping to match staged entry skills: ${error.message}`);
  process.exit(1);
}

if (mode === 'red') {
  console.error('Red precondition no longer holds.');
  process.exit(1);
}

console.log(mode === 'green'
  ? 'Green workflow next-entry smoke passed.'
  : 'Workflow next-entry verify smoke passed.');
