import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bindSession } from '../lib/sessions.mjs';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const preWritePath = path.join(repoRoot, 'hooks', 'scripts', 'pre-write.mjs');
const validatePath = path.join(repoRoot, 'runtime', 'validate.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node runtime/test/pre-write-governed-target-smoke.mjs <red|green|verify>');
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
    schemaVersion: 2,
    changeId: 'fixture-change',
    tier: 'L2',
    state: 'EXECUTING',
    owner: 'fixture',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: ['test-query'], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    currentTask: 'fixture-task',
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'tdd', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness' },
    ...overrides,
  };
}

function bindFixtureSession(tempRoot, sessionId, changeId, overrides = {}) {
  return bindSession(tempRoot, {
    sessionId,
    changeId,
    worktreePath: tempRoot,
    controllerRevision: 'test-controller',
    ...overrides,
  }, { commonDir: path.join(tempRoot, '.git') });
}

function runPreWrite(tempRoot, filePath, { sessionId = null, toolName = 'Write' } = {}) {
  const pathField = toolName === 'NotebookEdit' ? 'notebook_path' : 'file_path';
  return spawnSync('node', [preWritePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({
      tool_name: toolName,
      tool_input: { [pathField]: filePath },
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
  });
}

function runValidate(tempRoot) {
  return spawnSync('node', [validatePath, 'fixture-change'], {
    cwd: tempRoot,
    encoding: 'utf-8',
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

// ── Existing scenarios (updated) ──

check('A: non-reference-service src/main/java with designApproved=false must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('B: forged legacy gates without agent receipts must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      gates: { designApproved: true, redVerified: true, redTask: 'fixture-task', redEvidenceRef: 'evidence/red.md' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('C: .java file outside any recognized convention must REMIND but not BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    const target = path.join(tempRoot, 'scripts', 'Migrate.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /REMINDER/);
    assert.doesNotMatch(result.stderr, /BLOCK/);
  });
});

check('D: reference-service backward compatibility must still BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    const target = path.join(tempRoot, 'reference-service', 'src', 'main', 'java', 'com', 'example', 'orders', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

// ── Stage-level artifact guards ──

check('E: clarify stage — missing requirements.md must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      state: 'DISCOVERED',
      workflow: { stage: 'clarify', clarifyReady: false, userConfirmedScope: false, planReady: false, tddStatus: 'not-started', nextEntry: '/harness' },
    }));
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /clarify/);
  });
});

check('F: clarify stage — userConfirmedScope=false must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      state: 'DISCOVERED',
      workflow: { stage: 'clarify', clarifyReady: true, userConfirmedScope: false, planReady: false, tddStatus: 'not-started', nextEntry: '/harness' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md'), '# Requirements\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /clarify scope|用户尚未确认执行范围/);
  });
});

check('G: route stage — missing tier must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      state: 'DISCOVERED',
      tier: undefined,
      workflow: { stage: 'route', clarifyReady: true, userConfirmedScope: true, planReady: false, tddStatus: 'not-started', nextEntry: '/harness' },
    }));
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /tier/);
  });
});

check('H: design stage — missing design.md must BLOCK (validate CLI)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      state: 'SPECIFIED',
      workflow: { stage: 'design', clarifyReady: true, userConfirmedScope: true, planReady: false, tddStatus: 'not-started', nextEntry: '/harness-design' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md'), '# Requirements\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'change.md'), '# Change\n');
    const result = runValidate(tempRoot);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /missing design\.md/);
  });
});

check('I: plan stage — missing tasks.md must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      state: 'DESIGN_APPROVED',
      gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
      workflow: { stage: 'plan', clarifyReady: true, userConfirmedScope: true, planReady: false, tddStatus: 'not-started', nextEntry: '/harness-plan' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /tasks\.md/);
  });
});

check('J: all projections without authoritative agent evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      gates: { designApproved: true, redVerified: true, redTask: 'fixture-task', redEvidenceRef: 'evidence/red.md' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'tasks.md'), '# Tasks\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md'), '# Requirements\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('K: codegraph evidence missing must BLOCK (validate CLI)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      tooling: { codegraph: { status: 'unknown', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'tasks.md'), '# Tasks\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md'), '# Requirements\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'change.md'), '# Change\n');
    const result = runValidate(tempRoot);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /CodeGraph/i);
  });
});

check('L: state codegraph projection cannot replace agent-bound evidence', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      gates: { designApproved: true, redVerified: true, redTask: 'fixture-task', redEvidenceRef: 'evidence/red.md' },
    }));
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'tasks.md'), '# Tasks\n');
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md'), '# Requirements\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
  });
});

// ── Harness opt-in boundary ──

check('M: unbound Claude session may use every direct-write tool across default governed roots', () => {
  withTempRoot((tempRoot) => {
    const targets = [
      path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'NewFile.java'),
      path.join(tempRoot, 'order-service', 'src', 'test', 'java', 'com', 'acme', 'FooTest.java'),
      path.join(tempRoot, 'order-service', 'openapi', 'orders.yaml'),
    ];
    for (const toolName of ['Write', 'Edit', 'NotebookEdit']) {
      for (const target of targets) {
        const result = runPreWrite(tempRoot, target, {
          sessionId: 'ordinary-claude-session',
          toolName,
        });
        assert.equal(result.status, 0, `${toolName} ${target}: expected exit 0, got ${result.status}; stderr=${result.stderr}`);
        assert.doesNotMatch(result.stderr, /BLOCK/);
      }
    }
  });
});

check('N: legacy client without a session or ACTIVE_CHANGE may edit a default governed path', () => {
  withTempRoot((tempRoot) => {
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
    assert.doesNotMatch(result.stderr, /BLOCK/);
  });
});

check('O: session-bound active change keeps governed write gates enabled', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'design.md'), '# Design\n');
    bindFixtureSession(tempRoot, 'governed-session', 'fixture-change');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target, { sessionId: 'governed-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('P: expired session binding fails closed with stable recovery guidance', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    bindFixtureSession(tempRoot, 'expired-session', 'fixture-change', {
      leaseExpiresAt: Date.now() - 1,
    });
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target, { sessionId: 'expired-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-SESSION-LEASE-023/);
    assert.match(result.stderr, /start-change fixture-change/);
  });
});

check('Q: malformed session binding fails closed instead of becoming an unbound session', () => {
  withTempRoot((tempRoot) => {
    const sessionDir = path.join(tempRoot, '.git', 'enterprise-harness', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'malformed-session.json'), '{not-json}\n', 'utf-8');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    writeText(target, '// fixture\n');
    const result = runPreWrite(tempRoot, target, { sessionId: 'malformed-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-SESSION-BINDING-024/);
    assert.match(result.stderr, /sessions unbind malformed-session/);
  });
});

check('R: dangling session binding symlink fails closed instead of becoming an unbound session', () => {
  withTempRoot((tempRoot) => {
    const sessionDir = path.join(tempRoot, '.git', 'enterprise-harness', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.symlinkSync(path.join(tempRoot, 'missing-binding.json'), path.join(sessionDir, 'dangling-session.json'));
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target, { sessionId: 'dangling-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-SESSION-BINDING-024/);
  });
});

check('S: malformed state for a bound session returns a stable fail-closed hook result', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), '{not-json}\n');
    bindFixtureSession(tempRoot, 'malformed-state-session', 'fixture-change');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target, { sessionId: 'malformed-state-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-STATE-READ-025/);
    assert.match(result.stderr, /enterprise-harness doctor/);
  });
});

check('T: malformed legacy active state also returns a stable fail-closed hook result', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), '{not-json}\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-STATE-READ-025/);
  });
});

check('U: bound session whose active state is missing fails closed', () => {
  withTempRoot((tempRoot) => {
    bindFixtureSession(tempRoot, 'missing-state-session', 'missing-change');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target, { sessionId: 'missing-state-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-SESSION-CHANGE-001/);
    assert.match(result.stderr, /missing-state/);
  });
});

check('V: structurally invalid JSON state for a bound session fails closed', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), 'null\n');
    bindFixtureSession(tempRoot, 'null-state-session', 'fixture-change');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target, { sessionId: 'null-state-session' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-STATE-READ-025/);
  });
});

check('W: structurally invalid legacy active state fails closed', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    writeText(path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'state.json'), 'null\n');
    const target = path.join(tempRoot, 'order-service', 'src', 'main', 'java', 'com', 'acme', 'Foo.java');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-STATE-READ-025/);
  });
});

check('X: a change transaction blocks direct hook-mediated writes', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes', 'fixture-change', '.change-transaction.lock'));
    const target = path.join(tempRoot, 'harness', 'changes', 'fixture-change', 'requirements.md');
    const result = runPreWrite(tempRoot, target);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /EH-CHANGE-TRANSACTION-150/u);
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
    fail('Expected pre-write.mjs to fail before the stage guard fix, but all scenarios passed.');
  }
  pass('Red precondition holds: pre-write.mjs does not yet have full stage guards.');
}

if (failures.length > 0) {
  fail('pre-write-governed-target-smoke failed.');
}

pass(mode === 'green' ? 'Green pre-write-governed-target-smoke passed.' : 'pre-write-governed-target-smoke verify passed.');
