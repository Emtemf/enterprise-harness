import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2] || 'verify';
const hookPath = path.join(repoRoot, 'harness', 'plugin', 'runtime', 'hooks', 'worktree-create.mjs');
const hookSource = fs.readFileSync(hookPath, 'utf-8');

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
  fs.writeFileSync(path.join(root, 'baseline-head.txt'), git(root, 'rev-parse', 'HEAD'));
  return root;
}

function fixtureBranchName(name) {
  return `enterprise-harness/${name}`;
}

function fixtureWorktreePath(root, name) {
  return path.join(root, '.claude', 'worktrees', name);
}

function parsePorcelainStanzas(listed) {
  const stanzas = String(listed || '')
    .split(/\n\n+/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return stanzas.map((stanza) => {
    const entry = {};
    for (const line of stanza.split(/\n/u)) {
      const [key, ...rest] = line.split(' ');
      entry[key] = rest.join(' ');
    }
    return entry;
  });
}

function listTrackedWorktrees(root) {
  return parsePorcelainStanzas(git(root, 'worktree', 'list', '--porcelain'));
}

function findTrackedWorktree(root, worktreePath) {
  return listTrackedWorktrees(root).find((entry) => path.resolve(entry.worktree || '') === path.resolve(worktreePath)) || null;
}

function assertNoRegisteredWorktree(root, worktreePath) {
  const expected = path.resolve(worktreePath);
  const listed = listTrackedWorktrees(root).some((entry) => path.resolve(entry.worktree || '') === expected);
  assert.equal(listed, false, `unexpected worktree registration for ${worktreePath}`);
}

function assertNoBranch(root, branchName) {
  const result = run('git', ['branch', '--list', branchName], root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(String(result.stdout || '').trim(), '', `unexpected branch ${branchName}`);
}

function assertDirectoryEntryMissing(targetPath, message) {
  const entry = fs.lstatSync(targetPath, { throwIfNoEntry: false });
  assert.equal(entry, undefined, message);
}

function seedActiveChange(root) {
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'task-probe\n');
}

function readBranchHead(root, branchName) {
  const result = run('git', ['rev-parse', '--verify', branchName], root);
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim() || null;
}

function verifyInjectionContractPresent() {
  assert.match(hookSource, /HARNESS_WORKTREE_CREATE_TEST_/u, 'worktree-create must expose fail-closed test-only injection hooks for deterministic compensation coverage');
}

function verifySuccessScenario(root) {
  seedActiveChange(root);
  fs.writeFileSync(path.join(root, 'README.md'), 'base\nparent-head\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-qm', 'parent head');
  const parentHead = git(root, 'rev-parse', 'HEAD');
  const name = 'task-2-current-head';

  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(String(result.stdout || '').trim(), stdoutLastNonEmptyLine(result), 'stdout must contain only the final absolute path');
  const worktreePath = stdoutLastNonEmptyLine(result);
  assert.equal(path.isAbsolute(worktreePath), true, 'worktree path must be absolute');
  assert.equal(path.normalize(worktreePath), fixtureWorktreePath(root, name));
  assert.equal(git(worktreePath, 'rev-parse', 'HEAD'), parentHead, 'child worktree must match parent HEAD');
  assert.equal(fs.readFileSync(path.join(worktreePath, 'harness', 'ACTIVE_CHANGE'), 'utf-8'), 'task-probe\n');
}

function verifyMissingActiveChangeCompatibility(root) {
  const name = 'task-2-no-active-change';
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const worktreePath = stdoutLastNonEmptyLine(result);
  assert.equal(fs.existsSync(path.join(worktreePath, 'harness', 'ACTIVE_CHANGE')), false, 'missing parent ACTIVE_CHANGE must not seed child ACTIVE_CHANGE');
}

function verifyInvalidInputs(root) {
  seedActiveChange(root);

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

function verifyBranchAndPathExclusion(root) {
  seedActiveChange(root);
  git(root, 'branch', fixtureBranchName('task-2-conflict'));
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-conflict',
  });
  assert.notEqual(result.status, 0);
  assertNoRegisteredWorktree(root, fixtureWorktreePath(root, 'task-2-conflict'));
}

function verifyInvalidActiveChangeFailsClosed(root) {
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), '../escape\n');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-invalid-active',
  });
  assert.notEqual(result.status, 0);
}

function verifyMissingStateAtHeadFailsClosed(root) {
  fs.writeFileSync(path.join(root, 'harness', 'ACTIVE_CHANGE'), 'missing-change\n');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-missing-state',
  });
  assert.notEqual(result.status, 0);
}

function verifySymlinkEscapeRejection(root) {
  seedActiveChange(root);
  fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true });
  fs.symlinkSync(path.join(os.tmpdir(), 'outside-claude-target'), path.join(root, '.claude'));
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name: 'task-2-symlink',
  });
  assert.notEqual(result.status, 0);
  assertNoBranch(root, fixtureBranchName('task-2-symlink'));
}

function verifyPreexistingDanglingSymlinkRejected(root) {
  seedActiveChange(root);
  const name = 'task-2-dangling-target';
  const worktreePath = fixtureWorktreePath(root, name);
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  fs.symlinkSync(path.join(root, 'missing-worktree-target'), worktreePath);
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr || ''), /already exists/u);
  assertNoRegisteredWorktree(root, worktreePath);
  assertNoBranch(root, fixtureBranchName(name));
}

function verifyCompensationOnActiveChangeCollision(root) {
  seedActiveChange(root);
  const name = 'task-2-collision';
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  }, {
    HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_COLLISION: 'existing-line\n',
  });
  assert.notEqual(result.status, 0);
  const worktreePath = fixtureWorktreePath(root, name);
  assertDirectoryEntryMissing(worktreePath, 'collision compensation must remove the created worktree directory entry');
  assertNoRegisteredWorktree(root, worktreePath);
  assertNoBranch(root, fixtureBranchName(name));
}

function verifyCompensationOnActiveChangeSymlink(root) {
  seedActiveChange(root);
  const name = 'task-2-active-symlink';
  const worktreePath = fixtureWorktreePath(root, name);
  const outsideTarget = path.join(root, 'outside-active-change-target');
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  }, {
    HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_SYMLINK_TARGET: outsideTarget,
  });
  assert.notEqual(result.status, 0);
  assertDirectoryEntryMissing(worktreePath, 'symlink compensation must remove the created worktree directory entry');
  assertNoRegisteredWorktree(root, worktreePath);
  assertNoBranch(root, fixtureBranchName(name));
}

function verifyOwnershipLossPreservesResources(root) {
  seedActiveChange(root);
  fs.writeFileSync(path.join(root, 'ownership-loss-marker.txt'), 'force-different-head\n');
  git(root, 'add', 'ownership-loss-marker.txt');
  git(root, 'commit', '-qm', 'ownership loss marker');
  const staleHead = fs.readFileSync(path.join(root, 'baseline-head.txt'), 'utf-8').trim();
  const currentHead = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(staleHead, currentHead, 'ownership-loss fixture must mutate branch HEAD to a different commit');
  const name = 'task-2-ownership-loss';
  const branchName = fixtureBranchName(name);
  const worktreePath = fixtureWorktreePath(root, name);
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  }, {
    HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_COLLISION: 'existing-line\n',
    HARNESS_WORKTREE_CREATE_TEST_BRANCH_HEAD_AFTER_ADD: staleHead,
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr || ''), /manual recovery|Recover manually|recover manually|recover manually with/u);
  assert.notEqual(fs.lstatSync(worktreePath, { throwIfNoEntry: false }), undefined, 'ownership loss must preserve worktree resources for manual recovery');
  assert.equal(readBranchHead(root, branchName), staleHead, 'ownership-loss fixture must preserve the exact injected stale branch HEAD');
  const preservedEntry = findTrackedWorktree(root, worktreePath);
  assert.notEqual(preservedEntry, null, 'ownership loss must preserve worktree registration');
  assert.equal(path.resolve(preservedEntry.worktree || ''), path.resolve(worktreePath), 'preserved stanza must keep the exact worktree path');
  assert.equal(preservedEntry.branch, `refs/heads/${branchName}`, 'preserved stanza must keep the exact branch ref');
  assert.equal(preservedEntry.HEAD, staleHead, 'preserved stanza must keep the exact injected stale branch HEAD');
}

function verifyCompensationOnHeadMismatch(root) {
  seedActiveChange(root);
  const name = 'task-2-compensate';
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  }, {
    HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_HEAD_AFTER_ADD: 'f'.repeat(40),
  });
  assert.notEqual(result.status, 0);
  const worktreePath = fixtureWorktreePath(root, name);
  assertDirectoryEntryMissing(worktreePath, 'compensation must remove the created worktree path');
  assertNoRegisteredWorktree(root, worktreePath);
  assertNoBranch(root, fixtureBranchName(name));

  const retry = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  });
  assert.equal(retry.status, 0, retry.stderr || retry.stdout);
}

function verifyRegistrationHeadMismatchPreservesResources(root) {
  seedActiveChange(root);
  fs.writeFileSync(path.join(root, 'registration-head-mismatch.txt'), 'mutate-head-before-create\n');
  git(root, 'add', 'registration-head-mismatch.txt');
  git(root, 'commit', '-qm', 'registration head mismatch marker');
  const capturedHead = git(root, 'rev-parse', 'HEAD');
  const mismatchedEntryHead = fs.readFileSync(path.join(root, 'baseline-head.txt'), 'utf-8').trim();
  assert.notEqual(mismatchedEntryHead, capturedHead, 'registration-head-mismatch fixture must use a HEAD different from the captured parent HEAD');
  const name = 'task-2-registration-head-mismatch';
  const branchName = fixtureBranchName(name);
  const worktreePath = fixtureWorktreePath(root, name);
  const result = runHook(root, {
    hook_event_name: 'WorktreeCreate',
    cwd: root,
    name,
  }, {
    HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_COLLISION: 'existing-line\n',
    HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP: `${worktreePath}:${mismatchedEntryHead}`,
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr || ''), /manual recovery|Recover manually|recover manually|recover manually with/u);
  assert.notEqual(fs.lstatSync(worktreePath, { throwIfNoEntry: false }), undefined, 'registration HEAD mismatch must preserve worktree resources for manual recovery');
  assert.equal(readBranchHead(root, branchName), capturedHead, 'registration HEAD mismatch counterexample must keep the exact captured branch HEAD');
  const preservedEntry = findTrackedWorktree(root, worktreePath);
  assert.notEqual(preservedEntry, null, 'registration HEAD mismatch must preserve worktree registration');
  assert.equal(path.resolve(preservedEntry.worktree || ''), path.resolve(worktreePath), 'registration HEAD mismatch must preserve exact stanza path');
  assert.equal(preservedEntry.branch, `refs/heads/${branchName}`, 'registration HEAD mismatch must preserve exact stanza branch');
  assert.equal(preservedEntry.HEAD, capturedHead, 'registration HEAD mismatch must preserve the original registration HEAD from git porcelain');
}

function cleanupRepo(root) {
  if (!root || !fs.existsSync(root)) return;
  for (const entry of listTrackedWorktrees(root)) {
    const worktreePath = entry.worktree;
    if (worktreePath && path.resolve(worktreePath).startsWith(path.resolve(path.join(root, '.claude', 'worktrees')))) {
      run('git', ['worktree', 'remove', '--force', worktreePath], root);
    }
  }
  const branchList = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/enterprise-harness/'], root);
  if (branchList.status === 0) {
    for (const branchName of String(branchList.stdout || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)) {
      run('git', ['branch', '-D', branchName], root);
    }
  }
  fs.rmSync(root, { recursive: true, force: true });
}

const formalScriptPresent = fs.existsSync(hookPath);

if (mode === 'red') {
  const failures = [];
  if (!formalScriptPresent) {
    failures.push('Missing harness/plugin/runtime/hooks/worktree-create.mjs');
  }
  try {
    verifyInjectionContractPresent();
  } catch (error) {
    failures.push(error.message);
  }
  if (failures.length > 0) {
    console.error(`Expected worktree-create contract to fail before implementation:\n${failures.join('\n')}`);
    process.exit(1);
  }
  const fixtureRoots = [];
  try {
    for (const [label, verify] of [
      ['success', verifySuccessScenario],
      ['missing-active-change', verifyMissingActiveChangeCompatibility],
      ['invalid-inputs', verifyInvalidInputs],
      ['branch-and-path-exclusion', verifyBranchAndPathExclusion],
      ['invalid-active-change', verifyInvalidActiveChangeFailsClosed],
      ['missing-state-at-head', verifyMissingStateAtHeadFailsClosed],
      ['symlink-escape', verifySymlinkEscapeRejection],
      ['preexisting-dangling-symlink', verifyPreexistingDanglingSymlinkRejected],
      ['active-change-collision', verifyCompensationOnActiveChangeCollision],
      ['active-change-symlink', verifyCompensationOnActiveChangeSymlink],
      ['ownership-loss', verifyOwnershipLossPreservesResources],
      ['head-mismatch', verifyCompensationOnHeadMismatch],
      ['registration-head-mismatch', verifyRegistrationHeadMismatchPreservesResources],
    ]) {
      const root = createRepo(`worktree-create-red-${label}`);
      fixtureRoots.push(root);
      try {
        verify(root);
      } catch (error) {
        failures.push(`${label}: ${error.message}`);
      }
    }
  } finally {
    for (const root of fixtureRoots) {
      cleanupRepo(root);
    }
  }
  if (failures.length > 0) {
    console.error(`Expected worktree-create contract to fail before implementation:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('Red precondition no longer holds.');
  process.exit(0);
}

if (!formalScriptPresent) {
  console.error('Missing harness/plugin/runtime/hooks/worktree-create.mjs');
  process.exit(1);
}

const fixtureRoots = [];
try {
  verifyInjectionContractPresent();
  {
    const root = createRepo('worktree-create-success');
    fixtureRoots.push(root);
    verifySuccessScenario(root);
  }
  {
    const root = createRepo('worktree-create-no-active-change');
    fixtureRoots.push(root);
    verifyMissingActiveChangeCompatibility(root);
  }
  {
    const root = createRepo('worktree-create-invalid');
    fixtureRoots.push(root);
    verifyInvalidInputs(root);
  }
  {
    const root = createRepo('worktree-create-exclusive');
    fixtureRoots.push(root);
    verifyBranchAndPathExclusion(root);
  }
  {
    const root = createRepo('worktree-create-invalid-active');
    fixtureRoots.push(root);
    verifyInvalidActiveChangeFailsClosed(root);
  }
  {
    const root = createRepo('worktree-create-missing-state');
    fixtureRoots.push(root);
    verifyMissingStateAtHeadFailsClosed(root);
  }
  {
    const root = createRepo('worktree-create-symlink');
    fixtureRoots.push(root);
    verifySymlinkEscapeRejection(root);
  }
  {
    const root = createRepo('worktree-create-dangling');
    fixtureRoots.push(root);
    verifyPreexistingDanglingSymlinkRejected(root);
  }
  {
    const root = createRepo('worktree-create-collision');
    fixtureRoots.push(root);
    verifyCompensationOnActiveChangeCollision(root);
  }
  {
    const root = createRepo('worktree-create-active-symlink');
    fixtureRoots.push(root);
    verifyCompensationOnActiveChangeSymlink(root);
  }
  {
    const root = createRepo('worktree-create-ownership-loss');
    fixtureRoots.push(root);
    verifyOwnershipLossPreservesResources(root);
  }
  {
    const root = createRepo('worktree-create-compensate');
    fixtureRoots.push(root);
    verifyCompensationOnHeadMismatch(root);
  }
  {
    const root = createRepo('worktree-create-registration-head-mismatch');
    fixtureRoots.push(root);
    verifyRegistrationHeadMismatchPreservesResources(root);
  }
  console.log(`PASS worktree-create-current-head ${mode}`);
} finally {
  for (const root of fixtureRoots) {
    cleanupRepo(root);
  }
}
