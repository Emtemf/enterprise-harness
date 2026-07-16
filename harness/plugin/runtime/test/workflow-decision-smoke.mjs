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
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function setupTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-decision-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  const changeId = 'decision-smoke';
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  fs.writeFileSync(path.join(repoCopy, 'harness', 'ACTIVE_CHANGE'), `${changeId}\n`, 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'requirements.md'), '# Requirements\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'change.md'), '# Change\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'validation.md'), '# Validation\n', 'utf-8');
  fs.writeFileSync(path.join(changeDir, 'state.json'), JSON.stringify({
    schemaVersion: 1,
    changeId,
    tier: 'L3',
    state: 'DRAFT',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: { codegraph: { status: 'available', queries: [], fallbackReason: null }, documentation: { status: 'unknown', libraries: [] } },
    decisions: [],
    blockers: [],
    approvals: {},
    currentTask: null,
    workflow: {
      stage: 'clarify',
      clarifyReady: true,
      userConfirmedScope: false,
      planReady: false,
      tddStatus: 'not-started',
      nextEntry: '/harness'
    },
    validation: { status: 'missing', digest: null, validatedAt: null }
  }, null, 2) + '\n', 'utf-8');
  return { tempRoot, repoCopy, changeId, changeDir };
}

function runWorkflow(cwd, args) {
  return spawnSync('node', [workflowPath, ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

function parseJson(result) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/workflow-decision-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy, changeId, changeDir } = setupTempRepo();
try {
  const statusBefore = parseJson(runWorkflow(repoCopy, ['status', changeId, '--json']));
  const decideResult = parseJson(runWorkflow(repoCopy, ['decide', changeId, 'confirm-scope', 'confirmed in smoke']));
  const stateAfter = JSON.parse(fs.readFileSync(path.join(changeDir, 'state.json'), 'utf-8'));
  const eventsPath = path.join(changeDir, 'evidence', 'workflow-events.jsonl');
  const eventsText = fs.readFileSync(eventsPath, 'utf-8');
  const ok =
    statusBefore?.pendingDecision?.kind === 'scope-confirmation' &&
    decideResult?.stage === 'route' &&
    stateAfter.workflow?.userConfirmedScope === true &&
    stateAfter.workflow?.stage === 'route' &&
    eventsText.includes('"type":"decision"');

  if (mode === 'red') {
    if (!ok) {
      fail('Expected workflow decide to resolve a pending human checkpoint and persist the decision');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected workflow decide to resolve a pending human checkpoint and persist the decision');
  }

  pass(mode === 'green' ? 'Green workflow-decision smoke passed.' : 'Workflow-decision verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
