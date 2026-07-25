import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRecoveryGuidance } from '../lib/recovery-guidance.mjs';

const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/recovery-guidance-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-guidance-'));
  try {
    run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function fixtureState() {
  return {
    schemaVersion: 3,
    changeId: 'fixture-change',
    tier: 'L1',
    state: 'DRAFT',
    owner: 'fixture',
    impact: { api: 'unknown', data: 'unknown', architecture: 'unknown', rule: 'unknown' },
    tooling: {
      codegraph: { status: 'available', queries: ['fixture-query'], fallbackReason: null },
      documentation: { status: 'unknown', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {},
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    currentTask: null,
    goal: 'fixture goal',
    successCriteria: [],
    routingReason: 'fixture routing',
    workflow: {
      stage: 'plan',
      clarifyReady: true,
      userConfirmedScope: true,
      planReady: true,
      tddStatus: 'not-started',
      nextEntry: '/harness-plan',
    },
    validation: { status: 'stale', digest: null, validatedAt: null },
  };
}

function verifyContract() {
  withTempRoot((tempRoot) => {
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes', 'fixture-change'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'fixture-change\n', 'utf-8');
    writeJson(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), fixtureState());

    const guidance = buildRecoveryGuidance(tempRoot);
    assert.equal(guidance.present, true);
    assert.equal(guidance.changeId, 'fixture-change');
    assert.equal(guidance.workflowStage, 'plan');
    assert.equal(guidance.nextEntry, '/harness-plan');
    assert.match(guidance.assetGuidance, /harness\/changes\/fixture-change/);
  });
}

try {
  verifyContract();
} catch (error) {
  if (mode === 'red') {
    console.log('Red precondition observed: recovery guidance helper is currently broken.');
    process.exit(0);
  }
  console.error(`Expected recovery guidance helper to centralize active-change handoff fields: ${error.message}`);
  process.exit(1);
}

if (mode === 'red') {
  console.error('Red precondition no longer holds.');
  process.exit(1);
}

console.log(mode === 'green' ? 'Green recovery guidance smoke passed.' : 'Recovery guidance verify smoke passed.');
