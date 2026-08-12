import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const postWritePath = path.join(repoRoot, 'hooks', 'scripts', 'post-write.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/post-write-change-tracking-smoke.mjs <red|green|verify>');
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

// post-write no longer runs full change validation (moved to runtime/verify.mjs).
// It only does: stale invalidation + Bash attribution + TECPC card output.
// Scenarios 1 and 3 now verify that post-write exits 0 and defers deep checks to verify.

check('scenario 1: harness/changes without harness/specs — post-write exits 0 (validation is verify concern)', () => {
  withTempRoot((tempRoot) => {
    const changeId = 'fixture-change';
    writeJson(path.join(tempRoot, 'harness', 'changes', changeId, 'state.json'), baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', changeId, 'change.md'), '# Change\n');
    const result = runPostWrite(tempRoot);
    assert.equal(result.status, 0, `post-write should exit 0; stderr=${result.stderr}`);
  });
});

check('scenario 2: no harness/ at all must safely no-op', () => {
  withTempRoot((tempRoot) => {
    const result = runPostWrite(tempRoot);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('scenario 3: isHarnessManaged=true with missing required file — post-write exits 0 (structure check is verify concern)', () => {
  withTempRoot((tempRoot) => {
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'harness', 'specs'), { recursive: true });
    const result = runPostWrite(tempRoot);
    assert.equal(result.status, 0, `post-write should exit 0; stderr=${result.stderr}`);
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
