import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyChange, applyRouteConfirmationDecision } from '../lib/workflow.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-route-classify-'));
try {
  const state = {
    tier: 'L3',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes' },
    workflow: { stage: 'route', routeReady: false, classification: null, nextEntry: '/harness-route' },
  };
  const classified = classifyChange(state);
  const next = applyRouteConfirmationDecision({ ...state, workflow: { ...state.workflow } }, 'confirm-route', classified);
  assert.equal(next.workflow.routeReady, true);
  assert.deepEqual(next.classification, classified);
  assert.deepEqual(next.workflow.classification, classified);
  assert.equal(next.workflow.stage, 'design');
  assert.equal(next.workflow.nextEntry, '/harness-design');
  assert.equal(next.workflow.classification.workflowTopology, 'clarify -> design -> plan -> implement -> verify -> archive');
  assert.equal(fs.existsSync(root), true);
  console.log('PASS route-classify decision verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
