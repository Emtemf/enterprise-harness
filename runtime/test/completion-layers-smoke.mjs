import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateState, validateApiContract } from '../lib/checks.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-completion-layers-'));
try {
  const changeId = 'change-a';
  fs.mkdirSync(path.join(root, 'harness', 'changes', changeId), { recursive: true });
  const stateResults = validateState(root, changeId, {
    state: 'EXECUTING',
    impact: { api: 'unknown', data: 'no', architecture: 'no', rule: 'no' },
    validation: { status: 'stale' },
  });
  assert.ok(stateResults.every((item) => (
    typeof item.code === 'string'
    && ['pass', 'block', 'unsupported', 'advisory'].includes(item.status)
    && typeof item.message === 'string'
  )));
  assert.ok(stateResults.some((item) => item.code === 'EH-COMPLETION-STATE-101'));
  assert.equal(validateApiContract(root, { impact: { api: 'yes' } })[0].status, 'unsupported');
  assert.equal(validateApiContract(root, { impact: { api: 'no' } })[0].status, 'advisory');
  console.log('PASS completion-layers verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
