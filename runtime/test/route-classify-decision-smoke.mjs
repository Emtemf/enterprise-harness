import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyRouteConfirmationDecision } from '../lib/workflow.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-route-classify-'));
try {
  const state = {
    workflow: { stage: 'route', routeReady: false, nextEntry: '/harness-route' },
  };
  const next = applyRouteConfirmationDecision({ ...state, workflow: { ...state.workflow } }, 'confirm-route');
  assert.equal(next.workflow.routeReady, true);
  assert.equal(next.classification, undefined);
  assert.equal(next.workflow.classification, undefined);
  assert.equal(next.workflow.stage, 'design');
  assert.equal(next.workflow.nextEntry, '/harness-design');
  assert.equal(fs.existsSync(root), true);
  console.log('PASS route-classify decision verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
