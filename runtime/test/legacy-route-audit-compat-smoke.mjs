import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditWorkflow } from '../lib/workflow-audit.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-route-audit-'));
const changeId = 'legacy-route-audit';
const changeDir = path.join(root, 'harness', 'changes', changeId);
try {
  fs.mkdirSync(path.join(root, 'harness'), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), 'harness/behavior-checks.json'),
    path.join(root, 'harness/behavior-checks.json'),
  );
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n');
  const state = {
    schemaVersion: 5,
    changeId,
    state: 'DISCOVERED',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    classification: null,
    gates: {},
    workflow: {
      stage: 'route',
      clarifyReady: true,
      userConfirmedScope: true,
      routeReady: false,
    },
  };
  const audit = auditWorkflow(root, changeId, state);
  assert.equal(audit.workflowStage, 'route', 'audit preserves the legacy stage in its summary');
  assert.ok(audit.stages.some((stage) => stage.stage === 'classify'), 'legacy route audits through classify contract');
  assert.equal(
    audit.blockers.some((blocker) => blocker.code === 'EH-AUDIT-STATE-005'),
    false,
    'legacy route must not be rejected as an unknown stage',
  );
  console.log('PASS legacy-route-audit-compat verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
