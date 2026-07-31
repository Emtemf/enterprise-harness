import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteJson, compareAndSwapJson } from '../lib/state-store.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-state-store-'));
try {
  const stateFile = path.join(root, 'state.json');
  const eventFile = path.join(root, 'events.jsonl');
  atomicWriteJson(stateFile, { revision: 1, value: 'initial' });
  compareAndSwapJson(
    stateFile,
    1,
    { revision: 2, value: 'winner' },
    eventFile,
    { eventId: 'wf_once', type: 'update' },
  );
  assert.throws(
    () => compareAndSwapJson(stateFile, 1, { revision: 2, value: 'stale' }),
    /EH-STATE-REVISION-014/u,
  );
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf-8')).value, 'winner');
  compareAndSwapJson(
    stateFile,
    2,
    { revision: 3, value: 'deduplicated' },
    eventFile,
    { eventId: 'wf_once', type: 'replay' },
  );
  assert.equal(fs.readFileSync(eventFile, 'utf-8').trim().split(/\r?\n/u).length, 1);
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.tmp') || name.endsWith('.lock')), false);
  console.log('PASS state-store-concurrency verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
