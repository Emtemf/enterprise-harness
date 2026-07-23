import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const preWritePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'pre-write.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/pre-write-governed-target-smoke.mjs <red|green|verify>');
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

function createChangeFixture(tempRoot, changeId, state) {
  fs.mkdirSync(path.join(tempRoot, 'harness'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  writeJson(path.join(tempRoot, 'harness', 'changes', changeId, 'state.json'), state);
}

function baseState(overrides = {}) {
  return {
    schemaVersion: 1,
    changeId: 'fixture-change',
    tier: 'L2',
    state: 'EXECUTING',
    owner: 'fixture',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    currentTask: 'fixture-task',
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    ...overrides,
  };
}

function runPreWrite(tempRoot, filePath) {
  return spawnSync('node', [preWritePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
  });
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-write-governed-target-'));
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

check('scenario A: non-reference-service src/main/java with designApproved=false must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('scenario B: gates satisfied must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      gates: { designApproved: true, redVerified: true, redTask: 'fixture-task', redEvidenceRef: 'evidence/red.md' },
    }));
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('scenario C: .java file outside any recognized convention must REMIND but not BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const target = path.join(tempRoot, 'scripts', 'Migrate.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /REMINDER/);
    assert.doesNotMatch(result.stderr, /BLOCK/);
  });
});

check('scenario D: reference-service backward compatibility must still BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const target = path.join(tempRoot, 'reference-service', 'src', 'main', 'java', 'com', 'example', 'orders', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
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
    fail('Expected pre-write.mjs to fail to BLOCK non-reference-service governed paths before the fix, but all scenarios passed.');
  }
  pass('Red precondition holds: pre-write.mjs does not yet generalize beyond reference-service/.');
}

if (failures.length > 0) {
  fail('pre-write-governed-target-smoke failed.');
}

pass(mode === 'green' ? 'Green pre-write-governed-target-smoke passed.' : 'pre-write-governed-target-smoke verify passed.');
