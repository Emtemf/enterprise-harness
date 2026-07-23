import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { hasChangeTracking } from '../lib/checks.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/checks-change-tracking-unit-smoke.mjs <red|green|verify>');
  process.exit(1);
}

function withTempDir(setup, run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-change-tracking-'));
  try {
    setup(tempRoot);
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

check('harness/changes only -> true', () => {
  withTempDir(
    (root) => fs.mkdirSync(path.join(root, 'harness', 'changes'), { recursive: true }),
    (root) => assert.equal(hasChangeTracking(root), true),
  );
});

check('harness/changes + harness/specs -> true', () => {
  withTempDir(
    (root) => {
      fs.mkdirSync(path.join(root, 'harness', 'changes'), { recursive: true });
      fs.mkdirSync(path.join(root, 'harness', 'specs'), { recursive: true });
    },
    (root) => assert.equal(hasChangeTracking(root), true),
  );
});

check('no harness/ at all -> false', () => {
  withTempDir(
    () => {},
    (root) => assert.equal(hasChangeTracking(root), false),
  );
});

check('harness/specs only (no harness/changes) -> false', () => {
  withTempDir(
    (root) => fs.mkdirSync(path.join(root, 'harness', 'specs'), { recursive: true }),
    (root) => assert.equal(hasChangeTracking(root), false),
  );
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
    fail('Expected hasChangeTracking to be missing/failing before implementation, but all cases passed.');
  }
  pass('Red precondition holds: hasChangeTracking is not yet implemented.');
}

if (failures.length > 0) {
  fail('checks-change-tracking-unit-smoke failed.');
}

pass(mode === 'green' ? 'Green checks-change-tracking-unit-smoke passed.' : 'checks-change-tracking-unit-smoke verify passed.');
