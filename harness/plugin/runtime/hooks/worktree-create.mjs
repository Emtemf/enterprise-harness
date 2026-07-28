import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
const SAFE_CHANGE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const OVERRIDE_HEAD_AFTER_ADD = process.env.HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_HEAD_AFTER_ADD || null;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return String(result.stdout || '').trim();
}

function readEvent() {
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) resolve({});
      else {
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      }
    });
    process.stdin.on('error', reject);
  });
}

function ensureRealDirectory(absolutePath, label) {
  const stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stat) return;
  if (stat.isSymbolicLink()) fail(`${label} must not be a symlink: ${absolutePath}`);
  if (!stat.isDirectory()) fail(`${label} must be a directory: ${absolutePath}`);
}

function ensureDirectoryHierarchy(repoRoot) {
  ensureRealDirectory(repoRoot, 'repo root');
  const claudeDir = path.join(repoRoot, '.claude');
  if (fs.existsSync(claudeDir)) ensureRealDirectory(claudeDir, '.claude');
  else fs.mkdirSync(claudeDir, { recursive: true });
  const worktreesDir = path.join(claudeDir, 'worktrees');
  if (fs.existsSync(worktreesDir)) ensureRealDirectory(worktreesDir, '.claude/worktrees');
  else fs.mkdirSync(worktreesDir, { recursive: true });
  const repoReal = fs.realpathSync(repoRoot);
  const parentReal = fs.realpathSync(worktreesDir);
  if (!parentReal.startsWith(`${repoReal}${path.sep}`)) {
    fail('.claude/worktrees escapes the repository root');
  }
  return { claudeDir, worktreesDir, repoReal, parentReal };
}

function ensureContainedCanonicalPath(expectedPath, canonicalParent) {
  const real = fs.realpathSync(expectedPath);
  if (real !== expectedPath) {
    throw new Error(`worktree path changed unexpectedly: ${real}`);
  }
  if (!real.startsWith(`${canonicalParent}${path.sep}`)) {
    throw new Error(`worktree path escapes canonical parent: ${real}`);
  }
}

function safeActiveChange(parentRepo, parentHead) {
  const activePath = path.join(parentRepo, 'harness', 'ACTIVE_CHANGE');
  if (!fs.existsSync(activePath)) return null;
  const value = fs.readFileSync(activePath, 'utf-8').trim();
  if (!SAFE_CHANGE_ID.test(value)) fail(`ACTIVE_CHANGE is unsafe: ${value}`);
  const stateRel = path.posix.join('harness', 'changes', value, 'state.json');
  const cat = spawnSync('git', ['-C', parentRepo, 'cat-file', '-e', `${parentHead}:${stateRel}`], {
    encoding: 'utf-8',
    shell: false,
  });
  if (cat.status !== 0) fail(`ACTIVE_CHANGE state.json is unavailable at parent HEAD: ${value}`);
  return value;
}

function publishActiveChange(parentRepo, childRoot, changeId, canonicalParent) {
  const parentHarness = path.join(parentRepo, 'harness');
  const childHarness = path.join(childRoot, 'harness');
  ensureRealDirectory(parentHarness, 'parent harness');
  ensureRealDirectory(childHarness, 'child harness');
  if (fs.realpathSync(parentHarness) !== parentHarness) fail('parent harness path must be canonical');
  if (fs.realpathSync(childHarness) !== childHarness) fail('child harness path must be canonical');
  ensureContainedCanonicalPath(childRoot, canonicalParent);
  const activePath = path.join(childHarness, 'ACTIVE_CHANGE');
  const tempPath = path.join(childHarness, `.ACTIVE_CHANGE.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, `${changeId}\n`, { flag: 'wx' });
  try {
    fs.linkSync(tempPath, activePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    if (error.code === 'EEXIST') throw new Error(`ACTIVE_CHANGE already exists: ${activePath}`);
    throw error;
  }
  fs.rmSync(tempPath, { force: true });
}

function registrationExists(repoRoot, worktreePath, branchName) {
  const listed = git(repoRoot, ['worktree', 'list', '--porcelain']);
  return listed.includes(`worktree ${worktreePath}`) && listed.includes(`branch refs/heads/${branchName}`);
}

function cleanupCreatedWorktree(repoRoot, worktreePath, branchName) {
  const details = [];
  if (registrationExists(repoRoot, worktreePath, branchName) || fs.existsSync(worktreePath)) {
    const remove = spawnSync('git', ['-C', repoRoot, 'worktree', 'remove', '--force', worktreePath], {
      encoding: 'utf-8',
      shell: false,
    });
    details.push(`git worktree remove --force ${worktreePath}`);
    if (remove.status !== 0) {
      throw new Error(`compensation failed removing worktree ${worktreePath}; retry manually: git -C ${repoRoot} worktree remove --force ${worktreePath}`);
    }
  }
  const branch = spawnSync('git', ['-C', repoRoot, 'branch', '-D', branchName], {
    encoding: 'utf-8',
    shell: false,
  });
  if (branch.status === 0) details.push(`git -C ${repoRoot} branch -D ${branchName}`);
  else {
    const existing = spawnSync('git', ['-C', repoRoot, 'branch', '--list', branchName], {
      encoding: 'utf-8',
      shell: false,
    });
    if (String(existing.stdout || '').trim()) {
      throw new Error(`compensation failed deleting branch ${branchName}; retry manually: git -C ${repoRoot} branch -D ${branchName}`);
    }
  }
  return details;
}

try {
  const event = await readEvent();
  if (event.hook_event_name !== 'WorktreeCreate') fail('hook_event_name must be WorktreeCreate');
  const cwd = String(event.cwd || '').trim();
  const name = String(event.name || '').trim();
  if (!path.isAbsolute(cwd) || !fs.existsSync(cwd)) fail('cwd must be an existing absolute path');
  if (!SAFE_NAME.test(name)) fail(`name must match ${SAFE_NAME}`);

  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!path.isAbsolute(repoRoot)) fail('git rev-parse --show-toplevel must return an absolute path');
  const parentHead = git(cwd, ['rev-parse', 'HEAD']);
  const { parentReal } = ensureDirectoryHierarchy(repoRoot);
  const worktreePath = path.join(repoRoot, '.claude', 'worktrees', name);
  const branchName = `enterprise-harness/${name}`;
  if (fs.existsSync(worktreePath)) fail(`worktree path already exists: ${worktreePath}`);
  const existingBranch = spawnSync('git', ['-C', repoRoot, 'branch', '--list', branchName], {
    encoding: 'utf-8',
    shell: false,
  });
  if (String(existingBranch.stdout || '').trim()) fail(`worktree branch already exists: ${branchName}`);
  const changeId = safeActiveChange(repoRoot, parentHead);

  let created = false;
  try {
    const add = spawnSync('git', ['-C', repoRoot, 'worktree', 'add', '-b', branchName, worktreePath, parentHead], {
      encoding: 'utf-8',
      shell: false,
    });
    if (add.status !== 0) fail(String(add.stderr || add.stdout || 'git worktree add failed').trim());
    created = true;
    ensureContainedCanonicalPath(worktreePath, parentReal);
    const observedHead = OVERRIDE_HEAD_AFTER_ADD || git(worktreePath, ['rev-parse', 'HEAD']);
    if (observedHead !== parentHead) {
      throw new Error(`worktree HEAD mismatch: expected ${parentHead} got ${observedHead}`);
    }
    if (changeId) {
      publishActiveChange(repoRoot, worktreePath, changeId, parentReal);
    }
    console.log(worktreePath);
    process.exit(0);
  } catch (error) {
    if (created) {
      try {
        cleanupCreatedWorktree(repoRoot, worktreePath, branchName);
      } catch (cleanupError) {
        fail(`${error.message}\n${cleanupError.message}`);
      }
    }
    fail(error.message);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
