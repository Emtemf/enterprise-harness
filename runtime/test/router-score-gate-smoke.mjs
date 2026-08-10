import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const validatePath = path.join(repoRoot, 'runtime', 'validate.mjs');
const mode = process.argv[2];

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}
function withTempRoot(run) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'router-score-gate-'));
  try { run(tempRoot); } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}
function baseState() {
  return {
    schemaVersion: 3,
    changeId: 'fixture-change',
    tier: 'L2',
    state: 'DISCOVERED',
    owner: 'fixture',
    impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no' },
    tooling: { codegraph: { status: 'available', queries: ['fixture-query'], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [], blockers: [], approvals: {}, currentTask: null,
    gates: { designApproved: false, redVerified: false, redTask: null, redEvidenceRef: null },
    validation: { status: 'missing', digest: null, validatedAt: null },
    workflow: { stage: 'route', clarifyReady: true, userConfirmedScope: true, planReady: false, tddStatus: 'not-started', nextEntry: '/harness-clarify' },
  };
}
function runValidate(tempRoot) {
  return spawnSync('node', [validatePath, 'fixture-change'], { cwd: tempRoot, encoding: 'utf-8' });
}
if (!['red','green','verify'].includes(mode)) {
  console.error('Usage: node runtime/test/router-score-gate-smoke.mjs <red|green|verify>');
  process.exit(1);
}
let failed = null;
try {
  withTempRoot((tempRoot) => {
    const changeDir = path.join(tempRoot, 'harness', 'changes', 'fixture-change');
    fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'harness', 'ACTIVE_CHANGE'), 'fixture-change\n', 'utf-8');
    writeJson(path.join(changeDir, 'state.json'), baseState());
    writeText(path.join(changeDir, 'change.md'), `# Change\n\n## 初步路由\n\n### Router 评分\n| 维度 | 分数(0-5) | 说明 |\n|------|----------|------|\n| Scope complexity | 5 | high |\n| Impact breadth | 4 | ok |\n| Unknowns / ambiguity |  | missing |\n| API / data risk | 5 | high |\n| Test / rollback complexity | 4 | ok |\n| **Overall** | 4 | mixed |\n`);
    const result = runValidate(tempRoot);
    assert.equal(result.status, 2, `expected exit 2, got ${result.status}; stderr=${result.stderr}`);
    assert.match(result.stderr, /route 评分未填写完整/);
  });
} catch (error) {
  failed = error;
}
if (mode === 'red') {
  if (failed) {
    console.error(failed.message);
    process.exit(1);
  }
  console.log('Red precondition no longer holds.');
  process.exit(0);
}
if (failed) {
  console.error(failed.message);
  process.exit(1);
}
console.log(mode === 'green' ? 'Green router score gate smoke passed.' : 'Router score gate verify smoke passed.');
