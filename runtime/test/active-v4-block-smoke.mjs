import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadActiveChange } from '../lib/gates.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-active-v4-'));
try {
  const changeDir = path.join(root, 'harness', 'changes', 'legacy');
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'legacy\n');
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 4,
    changeId: 'legacy',
    state: 'DRAFT',
  }));
  const result = loadActiveChange(root, { requireV5: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'active-state-v4');
  assert.equal(result.errorCode, 'EH-STATE-V5-001');
  console.log('PASS active-v4-block verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
