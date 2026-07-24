import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStatusSummary } from '../lib/status-summary.mjs';

const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/status-summary-next-entry-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'status-summary-next-entry-'));
  try {
    run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildFixtureState() {
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
    writeJson(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), buildFixtureState());
    fs.writeFileSync(path.join(tempRoot, 'PROGRESS.md'), '- 当前阶段：未记录\n- 当前目标：未记录\n', 'utf-8');

    const summary = buildStatusSummary(tempRoot);
    assert.equal(summary.nextStage, 'plan');
    assert.equal(summary.activeChange.nextEntry, '/harness-plan');
    assert.equal(summary.recommendedEntry, '/harness-plan');

    const clarifyState = buildFixtureState();
    clarifyState.gates.designApproved = false;
    clarifyState.workflow = {
      stage: 'clarify',
      clarifyReady: false,
      userConfirmedScope: false,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness',
    };
    writeJson(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), clarifyState);
    const clarifySummary = buildStatusSummary(tempRoot);
    assert.equal(clarifySummary.nextStage, 'clarify');
    assert.equal(clarifySummary.recommendedEntry, '/harness');
  });
}

try {
  verifyContract();
} catch (error) {
  if (mode === 'red') {
    console.log('Red precondition observed: status summary next entry contract is currently broken.');
    process.exit(0);
  }
  console.error(`Expected status summary to reuse active change nextEntry: ${error.message}`);
  process.exit(1);
}

if (mode === 'red') {
  console.error('Red precondition no longer holds.');
  process.exit(1);
}

console.log(mode === 'green'
  ? 'Green status-summary next-entry smoke passed.'
  : 'Status-summary next-entry verify smoke passed.');
