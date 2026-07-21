import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cliPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'cli.mjs');
const fixturesRoot = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'test', 'fixtures');
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf-8');
}

function createTempRepo() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-hardening-task-'));
  const repoCopy = path.join(tempRoot, 'repo');
  copyDir(repoRoot, repoCopy);
  return { tempRoot, repoCopy };
}

function createChange(repoCopy, changeId, state, tasksHeader, options = {}) {
  const changeDir = path.join(repoCopy, 'harness', 'changes', changeId);
  fs.mkdirSync(path.join(changeDir, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(changeDir, 'reviews'), { recursive: true });
  writeJson(path.join(changeDir, 'state.json'), state);
  writeText(path.join(changeDir, 'change.md'), '# Change\n');
  writeText(path.join(changeDir, 'design.md'), '# Design\n');
  writeText(path.join(changeDir, 'validation.md'), '# Validation\n');
  writeText(path.join(changeDir, 'evidence', 'tooling.md'), '# Tooling Evidence\n');
  writeText(path.join(changeDir, 'tasks.md'), tasksHeader);
  if (options.planVerdict) {
    writeJson(path.join(changeDir, 'reviews', 'plan-critic.json'), {
      changeId,
      reviewerId: 'plan-critic',
      verdict: options.planVerdict,
      findings: options.planVerdict === 'block' ? ['blocked in smoke fixture'] : [],
      evidence: ['task gate smoke fixture'],
      digest: null,
      reviewedAt: '2026-07-16',
    });
  }
  if (options.designVerdict) {
    writeJson(path.join(changeDir, 'reviews', 'design-reviewer.json'), {
      changeId,
      reviewerId: 'design-reviewer',
      verdict: options.designVerdict,
      findings: [],
      evidence: ['task gate smoke fixture'],
      digest: null,
      reviewedAt: '2026-07-16',
    });
  }
}

function runVerify(cwd) {
  return spawnSync('node', [cliPath, 'verify', '--json'], {
    cwd,
    encoding: 'utf-8',
  });
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
  console.error('Usage: node harness/plugin/runtime/test/gate-hardening-task-state-smoke.mjs <red|green|verify>');
  process.exit(1);
}

const { tempRoot, repoCopy } = createTempRepo();
try {
  const skeletonStatePath = path.join(repoCopy, 'harness', 'changes', 'gate-tightening-skeleton', 'state.json');
  if (fs.existsSync(skeletonStatePath)) {
    const skeletonState = readJson(skeletonStatePath);
    delete skeletonState.gates;
    writeJson(skeletonStatePath, skeletonState);
  }

  const draftTasksText = fs.readFileSync(path.join(fixturesRoot, 'task-gate-draft-tasks', 'tasks.md'), 'utf-8');
  createChange(repoCopy, 'task-gate-draft-tasks', {
    schemaVersion: 1,
    changeId: 'task-gate-draft-tasks',
    tier: 'L3',
    state: 'TASKED',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {
      design: { status: 'pass', reviewerId: 'design-reviewer', reviewedAt: '2026-07-16' },
      plan: { status: 'pass', reviewerId: 'plan-critic', reviewedAt: '2026-07-16' },
    },
    gates: { designApproved: true, redVerified: false },
    currentTask: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, draftTasksText, {
    designVerdict: 'pass',
    planVerdict: 'pass',
  });

  createChange(repoCopy, 'task-gate-missing-current-task', {
    schemaVersion: 1,
    changeId: 'task-gate-missing-current-task',
    tier: 'L3',
    state: 'EXECUTING',
    owner: 'harness-governance',
    impact: { api: 'no', data: 'no', architecture: 'yes', rule: 'yes' },
    tooling: {
      codegraph: { status: 'available', queries: [], fallbackReason: null },
      documentation: { status: 'not-needed', libraries: [] },
    },
    decisions: [],
    blockers: [],
    approvals: {
      design: { status: 'pass', reviewerId: 'design-reviewer', reviewedAt: '2026-07-16' },
      plan: { status: 'pass', reviewerId: 'plan-critic', reviewedAt: '2026-07-16' },
    },
    gates: { designApproved: true, redVerified: false },
    currentTask: null,
    validation: { status: 'missing', digest: null, validatedAt: null },
  }, '# Tasks\n\n### Task 1: Executing task\n', {
    designVerdict: 'pass',
    planVerdict: 'pass',
  });

  const result = runVerify(repoCopy);
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = null;
  }

  const problems = parsed?.contractChecks?.problems ?? parsed?.problems ?? [];
  const hasDraftTaskFailure = problems.some((problem) => problem.includes('task-gate-draft-tasks') && problem.includes('finalized tasks.md'));
  const hasCurrentTaskFailure = problems.some((problem) => problem.includes('task-gate-missing-current-task') && problem.includes('currentTask'));
  const ok = result.status !== 0 && parsed && hasDraftTaskFailure && hasCurrentTaskFailure;

  if (mode === 'red') {
    if (!ok) {
      fail('Expected TASKED transition to reject draft tasks or missing currentTask semantics');
    }
    pass('Red precondition no longer holds.');
  }

  if (!ok) {
    fail('Expected TASKED transition to reject draft tasks or missing currentTask semantics');
  }

  pass(mode === 'green' ? 'Green gate-hardening task-state smoke passed.' : 'Gate-hardening task-state verify smoke passed.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
