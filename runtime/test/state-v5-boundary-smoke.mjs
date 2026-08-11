import assert from 'node:assert/strict';
import { assertStateV5, isArchiveCompatibleState, createStateV5Envelope } from '../lib/state-v5.mjs';

const state = createStateV5Envelope({ changeId: 'next-change', owner: 'wula', tier: 'L3' });
assert.equal(state.schemaVersion, 5);
assert.doesNotThrow(() => assertStateV5(state));
assert.throws(
  () => assertStateV5({ ...state, schemaVersion: 4 }),
  /EH-STATE-V5-001/u,
);
assert.equal(isArchiveCompatibleState({ ...state, schemaVersion: 4 }, true), true);
assert.equal(isArchiveCompatibleState({ ...state, schemaVersion: 4 }, false), false);
console.log('PASS state-v5-boundary verify');
