import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveChangeState } from '../core/lifecycle-state.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v05-cas-lifecycle-'));
try {
  const changeId = 'cas-probe';
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'state.json'), `${JSON.stringify({
    schemaVersion: 5, revision: 1, changeId, lifecycle: 'active',
    state: 'DRAFT', tier: 'L1',
    impact: { api: 'unknown', data: 'unknown', architecture: 'unknown', rule: 'unknown' },
    workflow: { stage: 'clarify', nextEntry: '/harness' },
    gates: {}, validation: { status: 'missing', digest: null, validatedAt: null },
  })}\n`, 'utf-8');

  // Multiple sequential CAS writes must each increment revision
  const r1 = saveChangeState(root, changeId, (s) => ({ ...s, state: 'CLARIFIED' }), { type: 'clarified' });
  assert.equal(r1.revision, 2);
  const r2 = saveChangeState(root, changeId, (s) => ({ ...s, state: 'DESIGNED' }), { type: 'designed' });
  assert.equal(r2.revision, 3);
  const r3 = saveChangeState(root, changeId, (s) => ({ ...s, gates: { ...s.gates, designApproved: true } }), { type: 'design-approved' });
  assert.equal(r3.revision, 4);

  // Event log must have all 3 events in order
  const events = fs.readFileSync(path.join(changeDir, 'evidence', 'workflow-events.jsonl'), 'utf-8')
    .trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((e) => e.type), ['clarified', 'designed', 'design-approved']);
  assert.deepEqual(events.map((e) => e.revision), [2, 3, 4]);

  // Mutator input must be a deep copy — mutations must not leak into the caller's scope
  let capturedInput = null;
  saveChangeState(root, changeId, (s) => {
    capturedInput = s;
    s.workflow.stage = 'modified-inside-mutator';
    return { ...s, workflow: { ...s.workflow, stage: 'plan' } };
  }, { type: 'immutability-probe' });
  assert.equal(capturedInput.workflow.stage, 'modified-inside-mutator',
    'mutator may modify its own copy');
  const persisted = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  assert.equal(persisted.workflow.stage, 'plan',
    'persisted state must reflect the returned value, not intermediate mutation');

  console.log('PASS v05-scenario-lifecycle-cas verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
