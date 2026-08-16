import assert from 'node:assert/strict';
import {
  STAGE_SEQUENCE,
  assertForwardTransition,
  expectedNextStage,
} from '../core/stage-transition.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

assert.deepEqual(STAGE_SEQUENCE, ['clarify', 'design', 'plan', 'implement', 'verify', 'archive']);
for (let index = 0; index < STAGE_SEQUENCE.length - 1; index += 1) {
  const from = STAGE_SEQUENCE[index];
  const to = STAGE_SEQUENCE[index + 1];
  assert.equal(expectedNextStage(from), to);
  assert.doesNotThrow(() => assertForwardTransition(from, to));
}
assert.equal(expectedNextStage('archive'), null);
for (const [from, to] of [
  ['clarify', 'plan'],
  ['design', 'archive'],
  ['implement', 'design'],
  ['archive', 'archive'],
  ['unknown', 'design'],
]) {
  assert.throws(() => assertForwardTransition(from, to), /EH-TRANSITION-001/u);
}

console.log(`PASS six-stage transition ${mode}`);
