import assert from 'node:assert/strict';
import {
  encodeTaskChildOutcome,
  parseTaskChildOutcome,
  validateTaskChildOutcome,
} from '../lib/task-child-outcome.mjs';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const exited = {
  outcomeVersion: 1,
  kind: 'exit',
  exitCode: 7,
  signal: null,
  spawnError: null,
};
assert.deepEqual(validateTaskChildOutcome(exited), []);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'signal', exitCode: null }).join('; '),
  /requires signal/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'spawn-error', exitCode: null }).join('; '),
  /requires spawnError/u,
);
assert.deepEqual(parseTaskChildOutcome(encodeTaskChildOutcome(exited)), exited);
assert.throws(() => parseTaskChildOutcome('{invalid'), /invalid JSON/u);
assert.throws(() => parseTaskChildOutcome(JSON.stringify({
  ...exited,
  forged: true,
})), /unknown property forged/u);
assert.throws(() => parseTaskChildOutcome(''), /outcome is missing/u);

console.log(`PASS task-child-outcome ${mode}`);
