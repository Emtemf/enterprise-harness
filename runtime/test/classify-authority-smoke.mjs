import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyChange,
  inferCurrentGap,
  inferPendingDecision,
  inferWorkflowStage,
} from '../lib/workflow.mjs';

const changeId = 'classify-authority-probe';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-classify-authority-'));
const changeDir = path.join(root, 'harness', 'changes', changeId);
fs.mkdirSync(changeDir, { recursive: true });
fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# requirements\n');
try {
  const classification = classifyChange({
    tier: 'L3',
    impact: { api: 'yes', data: 'yes', architecture: 'yes', security: 'no' },
  });
  const classified = {
    state: 'DISCOVERED',
    classification,
    workflow: {
      stage: 'design',
      clarifyReady: true,
      userConfirmedScope: true,
      routeReady: false,
    },
  };

  assert.equal(
    inferWorkflowStage(changeId, classified),
    'design',
    'persisted classification must make route a compatibility projection, not a blocking stage',
  );
  const gap = inferCurrentGap(root, changeId, classified, 'design');
  assert.doesNotMatch(gap, /route/u);
  assert.equal(
    inferPendingDecision(changeId, classified, 'design', gap)?.kind,
    'design-approval',
    'classification must expose the next design decision directly',
  );

  const legacy = {
    ...classified,
    classification: null,
    workflow: { ...classified.workflow, stage: 'design' },
  };
  assert.equal(
    inferWorkflowStage(changeId, legacy),
    'route',
    'legacy state without classification still uses the route compatibility gate',
  );

  console.log('PASS classify-authority verify');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
