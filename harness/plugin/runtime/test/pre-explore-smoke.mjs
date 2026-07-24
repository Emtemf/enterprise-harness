import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const preExplorePath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'pre-explore.mjs');
const mode = process.argv[2];

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/pre-explore-smoke.mjs <red|green|verify>');
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
    schemaVersion: 3, changeId: 'fixture-change', tier: 'L2', state: 'EXECUTING',
    tooling: { codegraph: { status: 'unknown', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    decisions: [], blockers: [], approvals: {},
    currentTask: 'fixture-task',
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'design', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness' },
    ...overrides,
  };
}

function runPreExplore(tempRoot, toolName, input) {
  return spawnSync('node', [preExplorePath], {
    cwd: tempRoot,
    encoding: 'utf-8',
    input: JSON.stringify({ tool_name: toolName, tool_input: input }),
  });
}

function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-explore-smoke-'));
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

// ── RED ──
if (mode === 'red') {
  // pre-explore.mjs 不存在或无 codegraph 检查时应该 fail
  if (!fs.existsSync(preExplorePath)) {
    pass('Red precondition holds: pre-explore.mjs not yet implemented.');
  }
  // 如果存在，检查它是否有 codegraph 检查逻辑
  const content = fs.readFileSync(preExplorePath, 'utf-8');
  if (!content.includes('codegraph')) {
    console.log('Red precondition holds: pre-explore.mjs has no codegraph check.');
    process.exit(0);
  }
}

// ── GREEN / VERIFY ──

check('A: Grep on business code without codegraph evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'Template', path: 'src/main/java/com/example/Template.java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
    assert.match(result.stderr, /code-explore subagent/);
  });
});

check('B: Read on business code without codegraph evidence must BLOCK', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'src/main/java/com/example/TemplateService.java' });
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /BLOCK/);
  });
});

check('C: Grep with codegraph evidence present must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState({
      tooling: { codegraph: { status: 'available', queries: ['find-template-module'], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    }));
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'Template', path: 'src/main/java/com/example/' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('D: Read on harness/ internal files must PASS (exempt)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'harness/changes/fixture-change/design.md' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('E: Read on CLAUDE.md must PASS (exempt)', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Read', { file_path: 'CLAUDE.md' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('F: no active change must PASS (no enforcement)', () => {
  withTempRoot((tempRoot) => {
    fs.mkdirSync(path.join(tempRoot, 'harness', 'changes'), { recursive: true });
    // no ACTIVE_CHANGE
    const result = runPreExplore(tempRoot, 'Grep', { pattern: 'foo', path: 'src/' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
  });
});

check('G: non-exploration tool must PASS', () => {
  withTempRoot((tempRoot) => {
    createChangeFixture(tempRoot, 'fixture-change', baseState());
    const result = runPreExplore(tempRoot, 'Bash', { command: 'ls' });
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}; stderr=${result.stderr}`);
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

if (failures.length > 0) {
  fail('pre-explore-smoke failed.');
}

pass(mode === 'green' ? 'Green pre-explore-smoke passed.' : 'pre-explore-smoke verify passed.');
