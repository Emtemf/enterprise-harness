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
  console.error('Usage: node harness/plugin/runtime/test/tecp-card-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// ── RED ──
if (mode === 'red') {
  try {
    const { renderTECPCCard } = await import('../lib/tecp-card.mjs');
    if (typeof renderTECPCCard === 'function') {
      fail('renderTECPCCard already exists — red precondition no longer holds.');
    }
  } catch {
    // Expected
  }
  pass('Red precondition holds: renderTECPCCard not yet implemented.');
}

// ── GREEN / VERIFY ──
const { renderTECPCCard, renderTECPCard } = await import('../lib/tecp-card.mjs');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tecp-card-smoke-'));
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

function baseState(overrides = {}) {
  return {
    schemaVersion: 3, changeId: 'test', tier: 'L2', state: 'EXECUTING',
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

// ── TECPC card tests ──

check('T: card contains target when goal is set', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('模板支持硬删除')) failures.push('card missing target text');
    if (!card.includes('T 目标')) failures.push('card missing T label');
  } finally { cleanup(tmp); }
});

check('T: card shows "未记录" when goal is null', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState({ goal: null, routingReason: null }));
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('未记录')) failures.push('card should show 未记录 for missing target');
  } finally { cleanup(tmp); }
});

check('P: card shows routingReason in 路径', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('涉及 API+数据')) failures.push('card missing routingReason');
    if (!card.includes('P 路径')) failures.push('card missing P label');
  } finally { cleanup(tmp); }
});

check('C: card shows context (gap)', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('C 上下文')) failures.push('card missing C label');
  } finally { cleanup(tmp); }
});

check('E: card shows evidence summary', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState({ gates: { designApproved: true, redVerified: true, redTask: 't', redEvidenceRef: 'r' } }));
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('E 证据')) failures.push('card missing E label');
    if (!card.includes('design approved')) failures.push('card missing design approved evidence');
    if (!card.includes('RED verified')) failures.push('card missing RED verified evidence');
  } finally { cleanup(tmp); }
});

check('Ladder: correct ✓/▸/○ for stage=tdd', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), {
      'design.md': '# Design\n',
      'tasks.md': '# Tasks\n',
      'requirements.md': '# Req\n',
    });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('✓')) failures.push('card missing checkmark');
    if (!card.includes('▸')) failures.push('card missing arrow');
    if (!card.includes('○')) failures.push('card missing circle');
  } finally { cleanup(tmp); }
});

check('Ladder: all 7 stages in order', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), { 'design.md': '# D\n', 'tasks.md': '# T\n', 'requirements.md': '# R\n' });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    for (const s of ['clarify', 'route', 'design', 'plan', 'tdd', 'verify', 'archive']) {
      if (!card.includes(s)) failures.push(`card missing stage: ${s}`);
    }
  } finally { cleanup(tmp); }
});

check('C 纠正: includes next entry', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState());
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    if (!card.includes('C 纠正')) failures.push('card missing C 纠正');
    if (!card.includes('harness-tdd') && !card.includes('/harness')) failures.push('card missing recovery entry');
  } finally { cleanup(tmp); }
});

check('Compact: no more than 20 lines', () => {
  const tmp = makeTmpDir();
  try {
    setupChangeDir(tmp, 'test', baseState(), { 'design.md': '# D\n', 'tasks.md': '# T\n', 'requirements.md': '# R\n' });
    const state = JSON.parse(fs.readFileSync(path.join(tmp, 'harness', 'changes', 'test', 'state.json'), 'utf-8'));
    const card = renderTECPCCard(tmp, 'test', state);
    const lines = card.split('\n').length;
    if (lines > 20) failures.push(`card too long: ${lines} lines (max 20)`);
  } finally { cleanup(tmp); }
});

check('Alias: renderTECPCard is backward-compatible alias for renderTECPCCard', () => {
  if (typeof renderTECPCard !== 'function') failures.push('renderTECPCard alias is not a function');
  if (renderTECPCard !== renderTECPCCard) failures.push('renderTECPCard is not the same function as renderTECPCCard');
});


// ── Results ──
if (failures.length > 0) {
  fail(`tecp-card-smoke failed:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green tecp-card-smoke passed.' : 'TECPC-card verify smoke passed.');
