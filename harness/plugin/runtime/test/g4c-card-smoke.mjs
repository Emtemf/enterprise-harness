import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/g4c-card-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// ── RED ──
if (mode === 'red') {
  try {
    const { renderG4CCard } = await import('../lib/g4c-card.mjs');
    if (typeof renderG4CCard === 'function') {
      fail('renderG4CCard already exists — red precondition no longer holds.');
    }
  } catch {
    // Expected: module not found or import error
  }
  pass('Red precondition holds: renderG4CCard not yet implemented.');
}

// ── GREEN / VERIFY ──
const { renderG4CCard } = await import('../lib/g4c-card.mjs');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'g4c-card-smoke-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

const failures = [];

function check(desc, fn) {
  try { fn(); } catch (e) { failures.push(`${desc}: ${e.message}`); }
}

// ── Fixture builders ──
function baseState(overrides = {}) {
  return {
    schemaVersion: 2, changeId: 'test', tier: 'L2', state: 'EXECUTING',
    goal: '模板支持硬删除', successCriteria: ['级联清理'], routingReason: '涉及 API+数据',
    impact: { api: 'no', data: 'no', architecture: 'no', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'not-needed', libraries: [] } },
    decisions: [], blockers: [], approvals: {},
    currentTask: 'test-task',
    gates: { designApproved: true, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'tdd', clarifyReady: true, userConfirmedScope: true, planReady: true, tddStatus: 'not-started', nextEntry: '/harness-tdd' },
    ...overrides,
  };
}

function setupChangeDir(tmpDir, changeId, state, files = {}) {
  const changeDir = path.join(tmpDir, 'harness', 'changes', changeId);
  writeJson(path.join(changeDir, 'state.json'), state);
  for (const [name, content] of Object.entries(files)) {
    writeText(path.join(changeDir, name), content);
  }
  return changeDir;
}

// ── Test cases ──

check('card contains Goal when goal is set', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    if (!card.includes('模板支持硬删除')) failures.push('card missing goal text');
    if (!card.includes('级联清理')) failures.push('card missing successCriteria');
  } finally { cleanup(tmp); }
});

check('card shows "未记录" when goal is null', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState({ goal: null, successCriteria: null, routingReason: null }));
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    if (!card.includes('未记录')) failures.push('card should show 未记录 for missing goal');
  } finally { cleanup(tmp); }
});

check('card shows routingReason in Choice', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    if (!card.includes('涉及 API+数据')) failures.push('card missing routingReason');
  } finally { cleanup(tmp); }
});

check('card shows correct ladder for stage=tdd', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), {
      'design.md': '# Design\n',
      'tasks.md': '# Tasks\n',
      'requirements.md': '# Req\n',
    });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    if (!card.includes('✓')) failures.push('card missing checkmark for completed stages');
    if (!card.includes('▸')) failures.push('card missing arrow for current stage');
    if (!card.includes('○')) failures.push('card missing circle for future stages');
  } finally { cleanup(tmp); }
});

check('card shows all 7 stages in order', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), { 'design.md': '# D\n', 'tasks.md': '# T\n', 'requirements.md': '# R\n' });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    const stages = ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive'];
    for (const s of stages) {
      if (!card.includes(s)) failures.push(`card missing stage: ${s}`);
    }
  } finally { cleanup(tmp); }
});

check('card includes Correction with next entry', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    if (!card.includes('Correction')) failures.push('card missing Correction section');
    if (!card.includes('harness-tdd') && !card.includes('/harness')) failures.push('card missing recovery entry');
  } finally { cleanup(tmp); }
});

check('card is compact (no more than 20 lines)', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), { 'design.md': '# D\n', 'tasks.md': '# T\n', 'requirements.md': '# R\n' });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderG4CCard(tmp, 'test', state);
    const lines = card.split('\n').length;
    if (lines > 20) failures.push(`card too long: ${lines} lines (max 20)`);
  } finally { cleanup(tmp); }
});

// ── Results ──
if (failures.length > 0) {
  fail(`g4c-card-smoke failed:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green g4c-card-smoke passed.' : 'G4c-card verify smoke passed.');
