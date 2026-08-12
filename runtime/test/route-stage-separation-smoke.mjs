import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inferCurrentGap,
  inferPendingDecision,
  inferWorkflowStage,
  recommendNextEntry,
} from '../lib/workflow.mjs';

const changeId = 'route-separation-probe';

function withRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-route-separation-'));
  const changeDir = path.join(root, 'harness', 'changes', changeId);
  fs.mkdirSync(changeDir, { recursive: true });
  for (const name of ['requirements.md', 'design.md', 'tasks.md']) {
    fs.writeFileSync(path.join(changeDir, name), `# ${name}\n`);
  }
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function clarified(extra = {}) {
  return {
    state: 'DISCOVERED',
    workflow: {
      stage: 'route',
      clarifyReady: true,
      userConfirmedScope: true,
      ...extra,
    },
    gates: {},
    approvals: {},
  };
}

// route must be a gate of its own: clarify passing is not enough to enter design.
withRoot(() => {
  const data = {
    ...clarified(),
    workflow: { ...clarified().workflow, stage: 'design' },
  };
  assert.equal(
    inferWorkflowStage(changeId, data),
    'route',
    'design must fall back to route while routeReady is false',
  );
});

// once route is ready, design is reachable.
withRoot(() => {
  const data = {
    ...clarified({ routeReady: true }),
    workflow: {
      stage: 'design', clarifyReady: true, userConfirmedScope: true, routeReady: true,
    },
  };
  assert.equal(inferWorkflowStage(changeId, data), 'design');
});

// route needs its own pause point, distinct from clarify's two decisions.
withRoot((root) => {
  const data = clarified();
  const gap = inferCurrentGap(root, changeId, data, 'route');
  const decision = inferPendingDecision(changeId, data, 'route', gap);
  assert.ok(decision, 'route must surface a pending decision while routeReady is false');
  assert.equal(decision.kind, 'route-confirmation');
  assert.ok(
    decision.options.includes('confirm-route'),
    `route decision must offer confirm-route; got ${JSON.stringify(decision.options)}`,
  );
});

// a confirmed route must not keep asking.
withRoot((root) => {
  const data = clarified({ routeReady: true });
  const gap = inferCurrentGap(root, changeId, data, 'route');
  assert.equal(inferPendingDecision(changeId, data, 'route', gap), null);
});

// route's gap must be about route, not a restatement of clarify's flags.
withRoot((root) => {
  const gap = inferCurrentGap(root, changeId, clarified(), 'route');
  assert.match(gap, /route/i);
  assert.doesNotMatch(gap, /clarify 结果尚未可消费/);
});

// route must have its own correction path; sending users back to clarify loses the stage.
withRoot(() => {
  assert.notEqual(
    recommendNextEntry('route'),
    recommendNextEntry('clarify'),
    'legacy route correction must remain distinguishable from clarify',
  );
});

console.log(`PASS route-stage-separation ${process.argv[2] || 'verify'}`);
