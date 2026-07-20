import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = '/home/wula/IdeaProjects/sdd';
const workflowPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'workflow.mjs');
const mode = process.argv[2];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.codegraph') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function runWorkflow(cwd, args) {
  return spawnSync('node', [workflowPath, ...args], { cwd, encoding: 'utf-8' });
}

function parseJson(result) {
  try { return JSON.parse(result.stdout); } catch { return null; }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red','green','verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/clarify-gate-routing-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clarify-gate-routing-'));
const repoCopy = path.join(tempRoot, 'repo');
copyDir(repoRoot, repoCopy);
const changeId = 'clarify-gate-smoke';
const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
fs.writeFileSync(path.join(changeDir, 'design.md'), '# Design\n', 'utf-8');
fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
  schemaVersion: 1,
  changeId,
  tier: 'L3',
  state: 'DISCOVERED',
  owner: 'harness-governance',
  impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
  tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
  decisions: [],
  blockers: [],
  approvals: {},
  currentTask: null,
  workflow: {
    stage: 'design',
    clarifyReady: false,
    userConfirmedScope: false,
    planReady: false,
    tddStatus: 'not-started',
    nextEntry: '/harness-design'
  },
  validation: { status: 'missing', digest: null, validatedAt: null }
}, null, 2) + '\n', 'utf-8');

try {
  const statusResult = parseJson(runWorkflow(repoCopy, ['status', changeId, '--json']));
  const ok = statusResult?.stage === 'clarify'
    && statusResult?.pendingDecision?.kind === 'requirement-clarification'
    && statusResult?.currentGap === '缺少 requirements.md。'
    && statusResult?.nextAction === `workflow decide ${changeId} <answer-next-question|narrow-scope|stop>`;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected impossible design-stage state to be forced back to clarify until ambiguity and user confirmation are satisfied');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected impossible design-stage state to be forced back to clarify until ambiguity and user confirmation are satisfied');
  }

  pass(mode === 'green' ? 'Green clarify-gate routing smoke passed.' : 'Clarify-gate routing verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
