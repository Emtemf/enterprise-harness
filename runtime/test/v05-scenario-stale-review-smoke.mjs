import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { saveChangeState } from '../core/lifecycle-state.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-v05-stale-review-'));
try {
  // Setup: create a change with v5 state
  const changeId = 'stale-review-probe';
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  const statePath = path.join(changeDir, 'state.json');
  fs.writeFileSync(statePath, `${JSON.stringify({
    schemaVersion: 5, revision: 1, changeId, lifecycle: 'active',
    state: 'DESIGN_APPROVED', tier: 'L3',
    impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no' },
    workflow: { stage: 'plan', nextEntry: '/harness-plan' },
    gates: { designApproved: true, redVerified: false },
    validation: { status: 'missing', digest: null, validatedAt: null },
    artifacts: {},
  })}\n`, 'utf-8');

  // Write a design artifact and its review
  const designPath = path.join(changeDir, 'design.md');
  fs.writeFileSync(designPath, '# Design v1\n', 'utf-8');
  const designDigest = createHash('sha256').update(fs.readFileSync(designPath)).digest('hex');
  const reviewPath = path.join(changeDir, 'reviews', 'design-reviewer.json');
  fs.writeFileSync(reviewPath, `${JSON.stringify({
    changeId, reviewerId: 'design-reviewer', verdict: 'pass',
    inputDigest: designDigest, reviewedAt: '2026-08-13',
  })}\n`, 'utf-8');

  // Scenario: modifying the design artifact must make the review stale
  fs.writeFileSync(designPath, '# Design v2 — changed\n', 'utf-8');
  const newDigest = createHash('sha256').update(fs.readFileSync(designPath)).digest('hex');
  assert.notEqual(designDigest, newDigest, 'design must have actually changed');

  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
  assert.notEqual(review.inputDigest, newDigest,
    'review digest must not match the changed artifact — it is stale by derivation');

  // A state mutation through saveChangeState must bump revision
  const before = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const after = saveChangeState(root, changeId, (s) => ({ ...s, artifacts: { design: { digest: newDigest } } }), { type: 'artifact-digest-update' });
  assert.equal(after.revision, before.revision + 1, 'saveChangeState must increment revision');

  // Event log must have the event
  const eventPath = path.join(changeDir, 'evidence', 'workflow-events.jsonl');
  assert.ok(fs.existsSync(eventPath), 'event log must be created');
  const events = fs.readFileSync(eventPath, 'utf-8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'artifact-digest-update');

  console.log('PASS v05-scenario-stale-review verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
