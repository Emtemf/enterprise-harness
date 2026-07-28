import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2] || 'verify';
const hookPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'worktree-create.mjs');

function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
}

function git(root, ...args) {
  const result = run('git', args, root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout || '').trim();
}

function runHook(cwd, payload, env = {}) {
  return run('node', [hookPath], cwd, {
    input: `${JSON.stringify(payload)}\n`,
    env: { ...process.env, ...env },
  });
}

function stdoutLastNonEmptyLine(result) {
  return String(result.stdout || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || '';
}

function createRepo(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'harness@example.invalid');
  git(root, 'config', 'user.name', 'Harness Smoke');
  fs.mkdirSync(path.join(root, 'harness', 'changes', 'task-probe'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  fs.writeFileSync(path.join(root, 'harness', 'changes', 'task-probe', 'state.json'), JSON.stringify({ state: 'TASKED' }, null, 2));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

function assertNoRegisteredWorktree(root, worktreePath) {
  const listed = git(root, 'worktree', 'list', '--porcelain');
  assert.equal(listed.includes(path.resolve(worktreePath)), false, `unexpected worktree registration for ${worktreePath}`);
}

function assertNoBranch(root, branchName) {
  const result = run('git', ['branch', '--list', branchName], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(String(result.stdout || '').trim(), '', `unexpected branch ${branchName}`);
}

function verifySuccessScenario() {
  const root = createRepo('worktree-create-success');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\nparent-head\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-qm', 'parent head');
  const parentHead = git(root, 'rev-parse', 'HEAD');

  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-current-head',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(String(result.stdout || '').trim(), stdoutLastNonEmptyLine(result), 'stdout must contain only the final absolute path');
  const worktreePath = stdoutLastNonEmptyLine(result);
  assert.equal(path.isAbsolute(worktreePath), true, 'worktree path must be absolute');
  assert.equal(path.normalize(worktreePath), path.join(root, '.claude', 'worktrees', 'task-2-current-head'));
  assert.equal(git(worktreePath, 'rev-parse', 'HEAD'), parentHead, 'child worktree must match parent HEAD');
  assert.equal(fs.readFileSync(path.join(worktreePath, 'harness', 'ACTIVE_CHANGE'), 'utf-8'), 'task-probe\n');
  return { root, worktreePath };
}

function verifyMissingActiveChangeCompatibility() {
  const root = createRepo('worktree-create-no-active-change');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-no-active-change',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const worktreePath = stdoutLastNonEmptyLine(result);
  assert.equal(fs.existsSync(path.join(worktreePath, 'harness', 'ACTIVE_CHANGE')), false, 'missing parent ACTIVE_CHANGE must not seed child ACTIVE_CHANGE');
  return { root, worktreePath };
}

function verifyInvalidInputs() {
  const root = createRepo('worktree-create-invalid');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');

  const badName = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'Bad_Name',
  });
  assert.notEqual(badName.status, 0);

  const badCwd = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: path.join(root, 'missing'),
    name: 'task-2-invalid-cwd',
  });
  assert.notEqual(badCwd.status, 0);

  const wrongEvent = runHook(root, {
    hook_event_name: 'OtherEvent',
    cwd: root,
    name: 'task-2-wrong-event',
  });
  assert.notEqual(wrongEvent.status, 0);
}

function verifyBranchAndPathExclusion() {
  const root = createRepo('worktree-create-exclusive');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');
  git(root, 'branch', 'enterprise-harness/task-2-conflict');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-conflict',
  });
  assert.notEqual(result.status, 0);
  assertNoRegisteredWorktree(root, path.join(root, '.claude', 'worktrees', 'task-2-conflict'));
}

function verifyInvalidActiveChangeFailsClosed() {
  const root = createRepo('worktree-create-invalid-active');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), '../escape\n');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-invalid-active',
  });
  assert.notEqual(result.status, 0);
}

function verifyMissingStateAtHeadFailsClosed() {
  const root = createRepo('worktree-create-missing-state');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'missing-change\n');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-missing-state',
  });
  assert.notEqual(result.status, 0);
}

function verifySymlinkEscapeRejection() {
  const root = createRepo('worktree-create-symlink');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');
  fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true });
  fs.symlinkSync(path.join(os.tmpdir(), 'outside-claude-target'), path.join(root, '.claude'));
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-symlink',
  });
  assert.notEqual(result.status, 0);
  assertNoBranch(root, 'enterprise-harness/task-2-symlink');
}

function verifyCompensationOnHeadMismatch() {
  const root = createRepo('worktree-create-compensate');
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-compensate',
  }, {
    HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_HEAD_AFTER_ADD: 'f'.repeat(40),
  });
  assert.notEqual(result.status, 0);
  const worktreePath = path.join(root, '.claude', 'worktrees', 'task-2-compensate');
  assert.equal(fs.existsSync(worktreePath), false, 'compensation must remove the created worktree path');
  assertNoRegisteredWorktree(root, worktreePath);
  assertNoBranch(root, 'enterprise-harness/task-2-compensate');

  const retry = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-compensate',
  });
  assert.equal(retry.status, 0, retry.stderr || retry.stdout);
}

const expectations = [
  () => fs.existsSync(hookPath),
];
const formalScriptPresent = expectations.every((check) => check());

if (mode === 'red') {
  if (formalScriptPresent) {
    console.error('Expected formal worktree-create hook to be absent before implementation.');
    process.exit(1);
  }
  console.log('PASS worktree-create-current-head red');
  process.exit(0);
}

if (!formalScriptPresent) {
  console.error('Missing harness/plugin/runtime/hooks/worktree-create.mjs');
  process.exit(1);
}

const created = [];
try {
  created.push(verifySuccessScenario());
  created.push(verifyMissingActiveChangeCompatibility());
  verifyInvalidInputs();
  verifyBranchAndPathExclusion();
  verifyInvalidActiveChangeFailsClosed();
  verifyMissingStateAtHeadFailsClosed();
  verifySymlinkEscapeRejection();
  verifyCompensationOnHeadMismatch();
  console.log(`PASS worktree-create-current-head ${mode}`);
} finally {
  for (const entry of created) {
    if (entry?.worktreePath) {
      run('git', ['worktree', 'remove', '--force', entry.worktreePath], entry.root);
    }
    if (entry?.root) {
      fs.rmSync(entry.root, { recursive: true, force: true });
    }
  }
}
