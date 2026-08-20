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
assert.match(validateTaskChildOutcome(null).join('; '), /must be an object/u);
assert.match(validateTaskChildOutcome([]).join('; '), /must be an object/u);
assert.match(validateTaskChildOutcome({ ...exited, outcomeVersion: 2 }).join('; '), /outcomeVersion must be 1/u);
assert.match(validateTaskChildOutcome({ ...exited, kind: 'other' }).join('; '), /kind is invalid/u);
assert.match(validateTaskChildOutcome({ ...exited, exitCode: null }).join('; '), /requires an integer exitCode/u);
assert.match(validateTaskChildOutcome({ ...exited, signal: 'SIGTERM' }).join('; '), /requires signal=null/u);
assert.match(validateTaskChildOutcome({ ...exited, spawnError: 'ENOENT' }).join('; '), /requires spawnError=null/u);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'signal', exitCode: null }).join('; '),
  /requires signal/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'signal', exitCode: 1, signal: 'SIGTERM', spawnError: null }).join('; '),
  /requires exitCode=null/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'signal', exitCode: null, signal: 'SIGTERM', spawnError: 'ENOENT' }).join('; '),
  /requires spawnError=null/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'spawn-error', exitCode: null }).join('; '),
  /requires spawnError/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'spawn-error', exitCode: 1, signal: null, spawnError: 'ENOENT' }).join('; '),
  /requires exitCode=null/u,
);
assert.match(
  validateTaskChildOutcome({ ...exited, kind: 'spawn-error', exitCode: null, signal: 'SIGTERM', spawnError: 'ENOENT' }).join('; '),
  /requires signal=null/u,
);
assert.deepEqual(parseTaskChildOutcome(encodeTaskChildOutcome(exited)), exited);
assert.throws(() => parseTaskChildOutcome('{invalid'), /invalid JSON/u);
assert.throws(() => parseTaskChildOutcome(JSON.stringify({
  ...exited,
  forged: true,
})), /unknown property forged/u);
assert.throws(() => parseTaskChildOutcome(''), /outcome is missing/u);

console.log(`PASS task-child-outcome ${mode}`);
