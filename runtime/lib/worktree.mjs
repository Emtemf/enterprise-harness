import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const WORKTREE_SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const WORKTREE_SAFE_CHANGE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

// Test-only injection hooks, read from env. Kept here (not in the hook) so the
// deterministic compensation scenarios are still coverable after the logic moved
// out of hooks/ into lib/.
const OVERRIDE_HEAD_AFTER_ADD = process.env.HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_HEAD_AFTER_ADD || null;
const INJECT_ACTIVE_CHANGE_COLLISION = process.env.HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_COLLISION || null;
const INJECT_ACTIVE_CHANGE_SYMLINK_TARGET = process.env.HARNESS_WORKTREE_CREATE_TEST_ACTIVE_CHANGE_SYMLINK_TARGET || null;
const INJECT_BRANCH_HEAD_AFTER_ADD = process.env.HARNESS_WORKTREE_CREATE_TEST_BRANCH_HEAD_AFTER_ADD || null;
const OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP = process.env.HARNESS_WORKTREE_CREATE_TEST_OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP || null;

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

function runGit(cwd, args, options = {}) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
}

function lstatEntry(absolutePath) {
  return fs.lstatSync(absolutePath, { throwIfNoEntry: false });
}

export function canonicalPath(targetPath) {
  const resolved = path.resolve(targetPath);
  let canonical = resolved;
  try {
    canonical = fs.realpathSync.native(resolved);
  } catch {
    // Callers also use this helper while checking resources that may already
    // have been compensated, so a missing path keeps its absolute spelling.
  }
  const normalized = path.normalize(canonical);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function samePath(left, right) {
  return canonicalPath(left) === canonicalPath(right);
}

export function pathIsWithin(targetPath, parentPath) {
  const target = canonicalPath(targetPath);
  const parent = canonicalPath(parentPath);
  return target === parent || target.startsWith(`${parent}${path.sep}`);
}

function ensureRealDirectory(absolutePath, label) {
  const stat = lstatEntry(absolutePath);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${absolutePath}`);
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory: ${absolutePath}`);
}

function ensureDirectoryHierarchy(repoRoot) {
  ensureRealDirectory(repoRoot, 'repo root');
  const claudeDir = path.join(repoRoot, '.claude');
  if (lstatEntry(claudeDir)) ensureRealDirectory(claudeDir, '.claude');
  else fs.mkdirSync(claudeDir, { recursive: true });
  const worktreesDir = path.join(claudeDir, 'worktrees');
  if (lstatEntry(worktreesDir)) ensureRealDirectory(worktreesDir, '.claude/worktrees');
  else fs.mkdirSync(worktreesDir, { recursive: true });
  const repoReal = fs.realpathSync(repoRoot);
  const parentReal = fs.realpathSync(worktreesDir);
  if (!pathIsWithin(parentReal, repoReal)) {
    throw new Error('.claude/worktrees escapes the repository root');
  }
  return { worktreesDir, repoReal, parentReal };
}

function ensureContainedCanonicalPath(expectedPath, canonicalParent) {
  const real = canonicalPath(expectedPath);
  if (!pathIsWithin(real, canonicalParent)) {
    throw new Error(`worktree path escapes canonical parent: ${real}`);
  }
}

function ensureSafeRegularFile(absolutePath, label) {
  const stat = lstatEntry(absolutePath);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${absolutePath}`);
  }
}

function ensureSafeTree(absolutePath, label) {
  const stat = lstatEntry(absolutePath);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${absolutePath}`);
  }
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const child = path.join(absolutePath, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${label} must not contain symlinks: ${child}`);
    if (entry.isDirectory()) ensureSafeTree(child, label);
    else if (!entry.isFile()) throw new Error(`${label} contains unsupported entry: ${child}`);
  }
}

function safeActiveChange(parentRepo) {
  const activePath = path.join(parentRepo, 'harness', 'ACTIVE_CHANGE');
  if (!lstatEntry(activePath)) return null;
  ensureSafeRegularFile(activePath, 'ACTIVE_CHANGE');
  const value = fs.readFileSync(activePath, 'utf-8').trim();
  if (!WORKTREE_SAFE_CHANGE_ID.test(value)) throw new Error(`ACTIVE_CHANGE is unsafe: ${value}`);
  const changePath = path.join(parentRepo, 'harness', 'changes', value);
  ensureSafeTree(changePath, `active change ${value}`);
  ensureSafeRegularFile(path.join(changePath, 'state.json'), `active change ${value} state.json`);
  return { changeId: value, changePath };
}

function snapshotActiveChange(active, childRoot, canonicalParent) {
  const childHarness = path.join(childRoot, 'harness');
  const childChange = path.join(childHarness, 'changes', active.changeId);
  ensureRealDirectory(childHarness, 'child harness');
  if (!pathIsWithin(childChange, childHarness)) throw new Error('active change snapshot escapes child harness');
  ensureContainedCanonicalPath(childRoot, canonicalParent);
  fs.cpSync(active.changePath, childChange, {
    recursive: true,
    dereference: false,
    errorOnExist: false,
    force: true,
  });
  ensureSafeTree(childChange, `child active change ${active.changeId}`);
  ensureSafeRegularFile(path.join(childChange, 'state.json'), `child active change ${active.changeId} state.json`);
}

function injectPublishFailure(childHarness, activePath) {
  if (INJECT_ACTIVE_CHANGE_COLLISION !== null) {
    fs.writeFileSync(activePath, INJECT_ACTIVE_CHANGE_COLLISION, { flag: 'wx' });
  }
  if (INJECT_ACTIVE_CHANGE_SYMLINK_TARGET !== null) {
    fs.symlinkSync(INJECT_ACTIVE_CHANGE_SYMLINK_TARGET, activePath);
  }
}

function publishActiveChange(parentRepo, childRoot, changeId, canonicalParent) {
  const parentHarness = path.join(parentRepo, 'harness');
  const childHarness = path.join(childRoot, 'harness');
  ensureRealDirectory(parentHarness, 'parent harness');
  ensureRealDirectory(childHarness, 'child harness');
  if (!pathIsWithin(parentHarness, parentRepo)) throw new Error('parent harness path escapes the repository root');
  if (!pathIsWithin(childHarness, childRoot)) throw new Error('child harness path escapes the worktree root');
  ensureContainedCanonicalPath(childRoot, canonicalParent);
  const activePath = path.join(childHarness, 'ACTIVE_CHANGE');
  const tempPath = path.join(childHarness, `.ACTIVE_CHANGE.${process.pid}.${Date.now()}.tmp`);
  injectPublishFailure(childHarness, activePath);
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

function parseWorktreePorcelain(repoRoot) {
  const listed = git(repoRoot, ['worktree', 'list', '--porcelain']);
  return String(listed || '')
    .split(/\n\n+/u)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((stanza) => {
      const entry = {};
      for (const line of stanza.split(/\n/u)) {
        const [key, ...rest] = line.split(' ');
        entry[key] = rest.join(' ');
      }
      return entry;
    });
}

function applyTestRegistrationHeadOverride(entry) {
  if (!entry || !OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP) return entry;
  let override;
  try {
    override = JSON.parse(OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP);
  } catch {
    const separator = OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP.lastIndexOf(':');
    override = {
      worktree: OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP.slice(0, separator),
      head: OVERRIDE_REGISTRATION_HEAD_DURING_CLEANUP.slice(separator + 1),
    };
  }
  if (!override || !samePath(entry.worktree || '', override.worktree || '')) {
    return entry;
  }
  const overrideHead = String(override.head || '');
  if (!overrideHead) return entry;
  return {
    ...entry,
    HEAD: overrideHead,
  };
}

function findOwnedRegistration(entries, worktreePath, branchName, expectedHead) {
  const expectedBranch = `refs/heads/${branchName}`;
  return entries.find((rawEntry) => {
    const entry = applyTestRegistrationHeadOverride(rawEntry);
    return samePath(entry.worktree || '', worktreePath)
      && entry.branch === expectedBranch
      && entry.HEAD === expectedHead;
  }) || null;
}

function findWorktreeByPath(repoRoot, worktreePath) {
  return parseWorktreePorcelain(repoRoot).find((entry) => samePath(entry.worktree || '', worktreePath)) || null;
}

function findWorktreeByBranch(repoRoot, branchName) {
  const expectedBranch = `refs/heads/${branchName}`;
  return parseWorktreePorcelain(repoRoot).find((entry) => entry.branch === expectedBranch) || null;
}

function readBranchHead(repoRoot, branchName) {
  const result = runGit(repoRoot, ['-C', repoRoot, 'rev-parse', '--verify', branchName]);
  if (result.status !== 0) {
    return null;
  }
  return String(result.stdout || '').trim() || null;
}

function cleanupCreatedWorktree(repoRoot, worktreePath, branchName, expectedHead) {
  if (INJECT_BRANCH_HEAD_AFTER_ADD) {
    const update = runGit(repoRoot, ['-C', repoRoot, 'update-ref', `refs/heads/${branchName}`, INJECT_BRANCH_HEAD_AFTER_ADD]);
    if (update.status !== 0) {
      throw new Error(`test injection failed updating branch ${branchName} to ${INJECT_BRANCH_HEAD_AFTER_ADD}`);
    }
  }
  const branchHead = readBranchHead(repoRoot, branchName);
  const snapshot = parseWorktreePorcelain(repoRoot);
  const ownedRegistration = findOwnedRegistration(snapshot, worktreePath, branchName, expectedHead);
  if (!ownedRegistration || branchHead !== expectedHead) {
    throw new Error(
      `compensation cannot prove ownership for path=${worktreePath} branch=${branchName} head=${expectedHead}; `
      + `detected branchHead=${branchHead || 'missing'}. Preserve resources and recover manually with: `
      + `git -C ${repoRoot} worktree list --porcelain && git -C ${repoRoot} branch --list ${branchName}`,
    );
  }

  const remove = runGit(repoRoot, ['-C', repoRoot, 'worktree', 'remove', '--force', worktreePath]);
  if (remove.status !== 0) {
    throw new Error(`compensation failed removing worktree ${worktreePath}; retry manually: git -C ${repoRoot} worktree remove --force ${worktreePath}`);
  }
  if (findWorktreeByPath(repoRoot, worktreePath)) {
    throw new Error(`compensation removed ${worktreePath} but registration still exists; inspect git -C ${repoRoot} worktree list --porcelain`);
  }
  if (lstatEntry(worktreePath)) {
    throw new Error(`compensation removed registration but path still exists: ${worktreePath}`);
  }

  const branchRegistration = findWorktreeByBranch(repoRoot, branchName);
  if (branchRegistration) {
    throw new Error(`compensation stopped before deleting branch ${branchName}; branch remains attached to ${branchRegistration.worktree}`);
  }

  const branchHeadAfterRemove = readBranchHead(repoRoot, branchName);
  if (!branchHeadAfterRemove) {
    return;
  }
  if (branchHeadAfterRemove !== expectedHead) {
    throw new Error(
      `compensation stopped before deleting branch ${branchName}; expected HEAD ${expectedHead} but found ${branchHeadAfterRemove}. `
      + `Recover manually after inspection: git -C ${repoRoot} branch --list ${branchName}`,
    );
  }

  const branchDelete = runGit(repoRoot, ['-C', repoRoot, 'branch', '-D', branchName]);
  if (branchDelete.status !== 0) {
    throw new Error(`compensation failed deleting branch ${branchName}; retry manually: git -C ${repoRoot} branch --delete --force ${branchName}`);
  }
  if (readBranchHead(repoRoot, branchName)) {
    throw new Error(`compensation reported branch delete success but ${branchName} still exists`);
  }
}

/**
 * Create a controlled worktree from a parent session HEAD, snapshotting the active
 * change into the child. On any failure after creation, compensate: remove the
 * worktree + branch, unless ownership cannot be proven (then preserve for manual
 * recovery). Returns the absolute worktree path.
 *
 * @param {object} event parsed hook event with { hook_event_name, cwd, name }
 * @returns {string} absolute path of the created worktree
 */
export function createWorktree(event) {
  if (event.hook_event_name !== 'WorktreeCreate') throw new Error('hook_event_name must be WorktreeCreate');
  const cwd = String(event.cwd || '').trim();
  const name = String(event.name || '').trim();
  if (!path.isAbsolute(cwd) || !lstatEntry(cwd)) throw new Error('cwd must be an existing absolute path');
  if (!WORKTREE_SAFE_NAME.test(name)) throw new Error(`name must match ${WORKTREE_SAFE_NAME}`);

  const repoRoot = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!path.isAbsolute(repoRoot)) throw new Error('git rev-parse --show-toplevel must return an absolute path');
  const parentHead = git(cwd, ['rev-parse', 'HEAD']);
  const { parentReal } = ensureDirectoryHierarchy(repoRoot);
  const worktreePath = path.join(repoRoot, '.claude', 'worktrees', name);
  const branchName = `enterprise-harness/${name}`;
  if (lstatEntry(worktreePath)) throw new Error(`worktree path already exists: ${worktreePath}`);
  if (String(runGit(repoRoot, ['-C', repoRoot, 'branch', '--list', branchName]).stdout || '').trim()) {
    throw new Error(`worktree branch already exists: ${branchName}`);
  }
  const active = safeActiveChange(repoRoot);

  let created = false;
  try {
    const add = runGit(repoRoot, ['-C', repoRoot, 'worktree', 'add', '-b', branchName, worktreePath, parentHead]);
    if (add.status !== 0) throw new Error(String(add.stderr || add.stdout || 'git worktree add failed').trim());
    created = true;
    ensureContainedCanonicalPath(worktreePath, parentReal);
    const observedHead = OVERRIDE_HEAD_AFTER_ADD || git(worktreePath, ['rev-parse', 'HEAD']);
    if (observedHead !== parentHead) {
      throw new Error(`worktree HEAD mismatch: expected ${parentHead} got ${observedHead}`);
    }
    if (active) {
      snapshotActiveChange(active, worktreePath, parentReal);
      publishActiveChange(repoRoot, worktreePath, active.changeId, parentReal);
    }
    return worktreePath;
  } catch (error) {
    if (created) {
      try {
        cleanupCreatedWorktree(repoRoot, worktreePath, branchName, parentHead);
      } catch (cleanupError) {
        throw new Error(`${error.message}\n${cleanupError.message}`);
      }
    }
    throw error;
  }
}

/**
 * Clean up a worktree that harness snapshot its active change into. The change
 * directory under `harness/` is a mirror of the parent repo's authoritative copy;
 * it is what makes Claude Code's automatic cleanup treat the worktree as "dirty"
 * and leave it behind. Removing the mirror lets the worktree be reclaimed.
 *
 * This is a WorktreeRemove side-effect handler: failures are best-effort and must
 * not block the removal. Only `harness/` (snapshot content) is touched — real
 * agent code changes outside harness/ are left alone for manual recovery.
 *
 * @param {object} event parsed WorktreeRemove hook event with { hook_event_name, cwd }
 */
export function cleanupWorktree(event) {
  if (event.hook_event_name !== 'WorktreeRemove') return { exitCode: 0 };
  const cwd = String(event.cwd || '').trim();
  if (!cwd || !lstatEntry(cwd)) return { exitCode: 0 };
  const childHarness = path.join(cwd, 'harness');
  if (lstatEntry(childHarness)) {
    fs.rmSync(childHarness, { recursive: true, force: true });
  }
  return { exitCode: 0 };
}
