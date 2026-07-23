import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { loadActiveChange } from '../lib/gates.mjs';
import { validateArtifactStates } from '../lib/checks.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/state-migration-backward-compat-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function withTempRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'state-migration-compat-'));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// version 1 state.json: no workflow.*, no redTask/redEvidenceRef, redVerified=true
const OLD_STATE_V1 = {
  schemaVersion: 1,
  changeId: 'old-v1-change',
  tier: 'L1',
  state: 'EXECUTING',
  owner: 'test',
  impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
  tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
  decisions: [],
  blockers: [],
  approvals: {},
  gates: { designApproved: true, redVerified: true },
  currentTask: 'old-task',
  validation: { status: 'missing', digest: null, validatedAt: null },
};

const failures = [];
function check(desc, fn) {
  try { fn(); } catch (error) { failures.push(`${desc}: ${error.message}`); }
}

// Test 1: version 1 state missing workflow.* should be auto-migrated
check('schemaVersion upgraded to 2', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'old-v1-change');
    fs.mkdirSync(changeDir, { recursive: true });
    writeJson(path.join(changeDir, 'state.json'), { ...OLD_STATE_V1 });
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'old-v1-change\n', 'utf-8');

    const result = loadActiveChange(root);
    if (!result.ok) throw new Error(`loadActiveChange failed: ${result.reason}`);
    if (result.data.schemaVersion !== 3) throw new Error(`expected schemaVersion 3, got ${result.data.schemaVersion}`);
  });
});

// Test 2: workflow.* should be fully populated
check('workflow.* fields populated', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'old-v1-change');
    fs.mkdirSync(changeDir, { recursive: true });
    writeJson(path.join(changeDir, 'state.json'), { ...OLD_STATE_V1 });
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'old-v1-change\n', 'utf-8');

    const result = loadActiveChange(root);
    if (!result.ok) throw new Error(`loadActiveChange failed: ${result.reason}`);
    const wf = result.data.workflow;
    if (!wf) throw new Error('workflow is missing after migration');
    if (typeof wf.clarifyReady !== 'boolean') throw new Error(`clarifyReady is ${typeof wf.clarifyReady}`);
    if (typeof wf.userConfirmedScope !== 'boolean') throw new Error(`userConfirmedScope is ${typeof wf.userConfirmedScope}`);
    if (typeof wf.planReady !== 'boolean') throw new Error(`planReady is ${typeof wf.planReady}`);
    if (!wf.tddStatus) throw new Error('tddStatus is missing');
    if (!wf.nextEntry) throw new Error('nextEntry is missing');
  });
});

// Test 3: redVerified=true with missing redTask/redEvidenceRef → reset to false
check('redVerified reset when fields missing', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'old-v1-change');
    fs.mkdirSync(changeDir, { recursive: true });
    writeJson(path.join(changeDir, 'state.json'), { ...OLD_STATE_V1 });
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'old-v1-change\n', 'utf-8');

    const result = loadActiveChange(root);
    if (!result.ok) throw new Error(`loadActiveChange failed: ${result.reason}`);
    if (result.data.gates.redVerified !== false) throw new Error(`expected redVerified false, got ${result.data.gates.redVerified}`);
    if (result.data.gates.redTask !== null) throw new Error(`expected redTask null, got ${result.data.gates.redTask}`);
    if (result.data.gates.redEvidenceRef !== null) throw new Error(`expected redEvidenceRef null, got ${result.data.gates.redEvidenceRef}`);
  });
});

// Test 4: validateArtifactStates should pass after migration
check('validateArtifactStates passes after migration', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'old-v1-change');
    fs.mkdirSync(changeDir, { recursive: true });
    writeJson(path.join(changeDir, 'state.json'), { ...OLD_STATE_V1 });
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'old-v1-change\n', 'utf-8');

    // Minimal fixture files to satisfy validateArtifactStates artifact checks
    fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
    fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
    fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n', 'utf-8');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '# Tasks\n', 'utf-8');
    fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'evidence', 'tooling.md'), '# Tooling\n', 'utf-8');
    fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
    writeJson(path.join(changeDir, 'reviews', 'design-reviewer.json'), {
      changeId: 'old-v1-change', reviewerId: 'design-reviewer', verdict: 'pass',
      findings: [], evidence: [], digest: null, reviewedAt: '2026-07-23',
    });
    writeJson(path.join(changeDir, 'reviews', 'plan-critic.json'), {
      changeId: 'old-v1-change', reviewerId: 'plan-critic', verdict: 'pass',
      findings: [], evidence: [], digest: null, reviewedAt: '2026-07-23',
    });

    loadActiveChange(root); // triggers migration
    const errors = validateArtifactStates(root);
    const migrationErrors = errors.filter((e) => e.includes('old-v1-change'));
    if (migrationErrors.length > 0) throw new Error(`validateArtifactStates errors: ${migrationErrors.join(', ')}`);
  });
});

// Test 5: disk state.json should be updated
check('disk state.json persisted after migration', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'old-v1-change');
    fs.mkdirSync(changeDir, { recursive: true });
    writeJson(path.join(changeDir, 'state.json'), { ...OLD_STATE_V1 });
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'old-v1-change\n', 'utf-8');

    loadActiveChange(root);
    const diskData = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
    if (diskData.schemaVersion !== 3) throw new Error(`disk schemaVersion not updated: ${diskData.schemaVersion}`);
    if (!diskData.workflow) throw new Error('disk workflow not written');
  });
});

// Test 6: state at version 2 should be migrated to v3 (G4C fields)
check('version 2 state migrated to v3 with G4C fields', () => {
  withTempRoot((root) => {
    const changeDir = path.join(root, 'harness', 'changes', 'v2-change');
    fs.mkdirSync(changeDir, { recursive: true });
    const v2State = {
      schemaVersion: 2,
      changeId: 'v2-change',
      tier: 'L1',
      state: 'EXECUTING',
      owner: 'test',
      impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
      tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
      decisions: [],
      blockers: [],
      approvals: {},
      gates: { designApproved: true, redVerified: true, redTask: 'my-task', redEvidenceRef: 'my-ref' },
      currentTask: 'my-task',
      workflow: { stage: 'verify', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness' },
      validation: { status: 'fresh', digest: 'abc', validatedAt: '2026-07-23' },
    };
    writeJson(path.join(changeDir, 'state.json'), v2State);
    fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'v2-change\n', 'utf-8');

    const result = loadActiveChange(root);
    if (!result.ok) throw new Error(`loadActiveChange failed: ${result.reason}`);
    if (result.data.schemaVersion !== 3) throw new Error(`expected schemaVersion 3, got ${result.data.schemaVersion}`);
    if (result.data.goal !== null) throw new Error(`expected goal null, got ${result.data.goal}`);
    if (!Array.isArray(result.data.successCriteria)) throw new Error('successCriteria should be array');
    if (result.data.routingReason !== null) throw new Error(`expected routingReason null, got ${result.data.routingReason}`);
    if (result.data.gates.redVerified !== true) throw new Error('redVerified should remain true');
    if (result.data.gates.redTask !== 'my-task') throw new Error('redTask should remain unchanged');
  });
});

function fail(message) {
  console.error(message);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (failures.length === 0) {
    fail('Expected backward-compat tests to fail before migration implementation, but all passed.');
  }
  pass('Red precondition holds: migration not yet implemented.');
}

if (failures.length > 0) {
  fail('state-migration-backward-compat-smoke failed.');
}

pass(mode === 'green' ? 'Green state-migration-backward-compat-smoke passed.' : 'state-migration-backward-compat-smoke verify passed.');
