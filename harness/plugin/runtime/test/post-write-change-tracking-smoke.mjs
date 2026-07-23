import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const postWritePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'post-write.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/post-write-change-tracking-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function baseState(overrides = {}) {
  return {
    schemaVersion: 1,
    changeId: 'fixture-change',
    tier: 'L1',
    state: 'DISCOVERED',
    owner: 'fixture',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    currentTask: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
    ...overrides,
  };
}

function runPostWrite(tempRoot) {
  return spawnSync('node', [postWritePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: '',
  });
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'post-write-change-tracking-'));
  try {
    run(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const failures = [];

function check(desc, fn) {
  try {
    fn();
  } catch (error) {
    failures.push(`${desc}: ${error.message}`);
  }
}

check('scenario 1: harness/changes without harness/specs must still report missing change evidence', () => {
  withTempRoot((tempRoot) => {
    const changeId = 'fixture-change';
    writeJson(path.join(tempRoot, 'harness', 'changes', changeId, 'state.json'), baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', changeId, 'change.md'), '# Change\n');
    // deliberately omit validation.md and evidence/tooling.md
    const result = runPostWrite(tempRoot);
    assert.notEqual(result.status, 0, `expected non-zero exit, got ${result.status}`);
    assert.match(result.stdout + result.stderr, /validation\.md/);
  });
});

check('scenario 2: no harness/ at all must safely no-op', () => {
  withTempRoot((tempRoot) => {
    const result = runPostWrite(tempRoot);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('scenario 3: isHarnessManaged=true but missing a requiredPaths() file must still run validateStructure', () => {
  withTempRoot((tempRoot) => {
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'harness', 'specs'), { recursive: true });
    // deliberately do not create AGENTS.md (one of requiredPaths()'s required files)
    const result = runPostWrite(tempRoot);
    assert.notEqual(result.status, 0, `expected non-zero exit, got ${result.status}`);
    assert.match(result.stdout + result.stderr, /file:AGENTS\.md/);
  });
});

function fail(message) {
  console.error(message);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (mode === 'red') {
  if (failures.length === 0) {
    fail('Expected post-write.mjs to no-op entirely for change-tracking-only projects before the fix, but all scenarios passed.');
  }
  pass('Red precondition holds: post-write.mjs does not yet validate change-tracking-only projects.');
}

if (failures.length > 0) {
  fail('post-write-change-tracking-smoke failed.');
}

pass(mode === 'green' ? 'Green post-write-change-tracking-smoke passed.' : 'post-write-change-tracking-smoke verify passed.');
