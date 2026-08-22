import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
let bumpType = 'patch';
let dryRun = false;
for (const arg of args) {
  if (arg === '--patch') bumpType = 'patch';
  else if (arg === '--minor') bumpType = 'minor';
  else if (arg === '--major') bumpType = 'major';
  else if (arg === '--dry-run') dryRun = true;
  else if (arg === '--help' || arg === '-h') {
    console.log('Enterprise Harness Release');
    console.log('Usage: node bin/release.mjs [--patch|--minor|--major] [--dry-run]');
    console.log('Builds and validates a release in an isolated temporary Git worktree.');
    process.exit(0);
  } else {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
}

function run(command, argv, cwd = repoRoot, options = {}) {
  const result = spawnSync(command, argv, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
  if (options.forward !== false) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${argv.join(' ')} failed`);
  }
  return String(result.stdout || '').trim();
}

function tryRun(command, argv, cwd = repoRoot, options = {}) {
  return spawnSync(command, argv, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
}

function bump(version, type) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`invalid package version: ${version}`);
  }
  let [major, minor, patch] = parts;
  if (type === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (type === 'minor') [minor, patch] = [minor + 1, 0];
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}

function githubRepositoryFromOrigin() {
  const origin = run('git', ['config', '--get', 'remote.origin.url'], repoRoot, { forward: false });
  const match = origin.match(/^(?:https?:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+\/[^/\s]+?)(?:\.git)?$/iu);
  if (!match) throw new Error(`EH-RELEASE-REMOTE-003: origin is not a supported GitHub repository: ${origin}`);
  return match[1];
}

function assertPreflight(tagName) {
  const githubRepository = githubRepositoryFromOrigin();
  run('gh', ['auth', 'status', '--hostname', 'github.com'], repoRoot, { forward: false });
  const permission = run(
    'gh',
    ['repo', 'view', githubRepository, '--json', 'viewerPermission', '--jq', '.viewerPermission'],
    repoRoot,
    { forward: false },
  );
  if (!['ADMIN', 'MAINTAIN', 'WRITE'].includes(permission)) {
    throw new Error(`EH-RELEASE-AUTH-004: ${githubRepository} is not writable by the current gh account`);
  }
  if (run('git', ['status', '--porcelain'], repoRoot, { forward: false })) {
    throw new Error('release requires a clean worktree');
  }
  if (run('git', ['branch', '--show-current'], repoRoot, { forward: false }) !== 'main') {
    throw new Error('release must start from main');
  }
  const local = run('git', ['rev-parse', 'HEAD'], repoRoot, { forward: false });
  const remote = run('git', ['rev-parse', 'origin/main'], repoRoot, { forward: false });
  if (local !== remote) throw new Error('main must exactly match origin/main');
  const localTag = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tagName}`], {
    cwd: repoRoot,
    encoding: 'utf-8',
    shell: false,
  });
  if (localTag.status === 0) throw new Error(`tag already exists: ${tagName}`);
  const remoteTag = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tagName}`], repoRoot, {
    forward: false,
  });
  if (remoteTag) throw new Error(`remote tag already exists: ${tagName}`);
  return { sourceHead: local, githubRepository };
}

function trackedChanges(cwd) {
  const unstaged = run('git', ['diff', '--name-only', '--'], cwd, { forward: false });
  const staged = run('git', ['diff', '--cached', '--name-only', '--'], cwd, { forward: false });
  return [...new Set(`${unstaged}\n${staged}`.split('\n').filter(Boolean))].sort();
}

function assertExactTrackedChanges(cwd, expected, stage) {
  const actual = trackedChanges(cwd);
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`EH-RELEASE-SOURCE-002: ${stage} tracked changes=${actual.join(',') || '<none>'}; expected=${wanted.join(',') || '<none>'}`);
  }
}

function assertArtifactBoundToCommit(cwd, commit) {
  const manifestPath = path.join(cwd, 'dist', 'manifest-files.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(manifest.files)) {
    throw new Error('EH-RELEASE-SOURCE-002: artifact manifest files are missing');
  }
  const tracked = new Set(
    run('git', ['ls-tree', '-r', '--name-only', commit], cwd, { forward: false }).split('\n').filter(Boolean),
  );
  for (const entry of manifest.files) {
    if (!entry || typeof entry.path !== 'string' || !tracked.has(entry.path)) {
      throw new Error(`EH-RELEASE-SOURCE-002: artifact contains untracked input ${entry?.path || '<invalid>'}`);
    }
    const content = fs.readFileSync(path.join(cwd, entry.path));
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (content.length !== entry.size || digest !== entry.sha256) {
      throw new Error(`EH-RELEASE-SOURCE-002: artifact manifest does not match release commit input ${entry.path}`);
    }
  }
}

function remoteRef(cwd, ref) {
  const result = tryRun('git', ['ls-remote', 'origin', ref], cwd);
  if (result.status !== 0) return null;
  return String(result.stdout || '').trim().split(/\s+/u)[0] || null;
}

function remoteTagTarget(cwd, tagName) {
  const result = tryRun('git', ['ls-remote', 'origin', `refs/tags/${tagName}`, `refs/tags/${tagName}^{}`], cwd);
  if (result.status !== 0) return null;
  const refs = new Map(String(result.stdout || '').trim().split('\n').filter(Boolean).map((line) => line.trim().split(/\s+/u).reverse()));
  return refs.get(`refs/tags/${tagName}^{}`) || refs.get(`refs/tags/${tagName}`) || null;
}

function releaseArgv(tagName, nextVersion, githubRepository) {
  return [
    'release', 'create', tagName,
    `dist/enterprise-harness-${nextVersion}.tar.gz`,
    'dist/manifest-files.json',
    'dist/SHA256SUMS',
    'dist/sbom.cdx.json',
    '--repo', githubRepository,
    '--title', tagName,
    '--notes-file', 'dist/release-notes.md',
    '--latest',
    '--verify-tag',
  ];
}

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const nextVersion = bump(pkg.version, bumpType);
const tagName = `v${nextVersion}`;
console.log(`Release plan: ${pkg.version} -> ${nextVersion} (${tagName})`);
console.log('1. verify clean synchronized main and absent tag');
console.log('2. create isolated release worktree');
console.log('3. update package version and generate projections');
console.log('4. run the complete local quality gate and build release assets');
console.log('5. commit only version projections, tag, push, then create the GitHub Release');
if (dryRun) process.exit(0);

let tempRoot;
let worktree;
let branchName;
let releaseCommit;
let githubRepository;
let mainPushAttempted = false;
let mainPushSucceeded = false;
let preserveRecovery = false;
try {
  ({ sourceHead: releaseCommit, githubRepository } = assertPreflight(tagName));
  const sourceHead = releaseCommit;
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-harness-release-'));
  worktree = path.join(tempRoot, 'worktree');
  branchName = `release-${nextVersion}-${process.pid}`;
  run('git', ['worktree', 'add', '-b', branchName, worktree, sourceHead]);

  const packagePath = path.join(worktree, 'package.json');
  const releasePackage = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  releasePackage.version = nextVersion;
  fs.writeFileSync(packagePath, `${JSON.stringify(releasePackage, null, 2)}\n`, 'utf-8');
  const changelogPath = path.join(worktree, 'CHANGELOG.md');
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const releaseDate = new Date().toISOString().slice(0, 10);
  const headingRe = new RegExp(`^## \\[${nextVersion.replace(/[[\]]/gu, '\\$&')}`, 'mu');
  const patched = headingRe.test(changelog)
    ? changelog
    : changelog.replace('## [Unreleased]\n', `## [Unreleased]\n\n## [${nextVersion}] - ${releaseDate}\n`);
  fs.writeFileSync(changelogPath, patched, 'utf-8');
  run(process.execPath, ['bin/sync-version.mjs', '--quiet'], worktree);

  const versionFiles = [
    'package.json',
    'harness/plugin/manifest.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'CHANGELOG.md',
  ];
  assertExactTrackedChanges(worktree, versionFiles, 'before release commit');
  run('git', ['add', '--', ...versionFiles], worktree);
  const expected = [...versionFiles].sort();
  const staged = run('git', ['diff', '--cached', '--name-only'], worktree, { forward: false })
    .split('\n')
    .filter(Boolean)
    .sort();
  const unexpected = staged.filter((f) => !expected.includes(f));
  if (unexpected.length > 0) {
    throw new Error(`unexpected release files staged: ${unexpected.join(', ')}`);
  }
  run('git', ['commit', '-m', `chore: release ${nextVersion}`], worktree);
  releaseCommit = run('git', ['rev-parse', 'HEAD'], worktree, { forward: false });

  run('codegraph', ['init'], worktree);
  run(process.execPath, ['bin/local-quality.mjs', '--out', 'dist', '--release-version', nextVersion], worktree);
  assertExactTrackedChanges(worktree, [], 'after local quality gate');
  assertArtifactBoundToCommit(worktree, releaseCommit);

  run('git', ['tag', tagName], worktree);
  mainPushAttempted = true;
  run('git', ['push', 'origin', `HEAD:main`], worktree);
  mainPushSucceeded = true;
  if (remoteRef(worktree, 'refs/heads/main') !== releaseCommit) {
    throw new Error('EH-RELEASE-REMOTE-005: origin/main does not identify the release commit');
  }
  run('git', ['push', 'origin', `refs/tags/${tagName}`], worktree);
  if (remoteTagTarget(worktree, tagName) !== releaseCommit) {
    throw new Error(`EH-RELEASE-REMOTE-005: origin tag ${tagName} does not identify the release commit`);
  }
  run('gh', releaseArgv(tagName, nextVersion, githubRepository), worktree);
  console.log(`Release ${nextVersion} pushed and published successfully.`);
} catch (error) {
  const observedRemoteMain = worktree && releaseCommit ? remoteRef(worktree, 'refs/heads/main') : null;
  if (observedRemoteMain === releaseCommit) {
    preserveRecovery = true;
    console.error(`BLOCK EH-RELEASE-PARTIAL-002: ${error.message}`);
    console.error(`RECOVERY_WORKTREE=${worktree}`);
    if (remoteTagTarget(worktree, tagName) !== releaseCommit) {
      console.error(`RECOVERY_TAG_ARGV=${JSON.stringify(['git', '-C', worktree, 'push', 'origin', `${releaseCommit}:refs/tags/${tagName}`])}`);
    }
    if (githubRepository) {
      console.error(`RECOVERY_RELEASE_ARGV=${JSON.stringify(['gh', ...releaseArgv(tagName, nextVersion, githubRepository)])}`);
    }
    console.error('Run the missing recovery argv in order; keep RECOVERY_WORKTREE as the working directory for the gh command.');
  } else {
    if ((mainPushSucceeded || (mainPushAttempted && observedRemoteMain === null)) && worktree) {
      preserveRecovery = true;
      console.error(`RECOVERY_WORKTREE=${worktree}`);
      console.error('Remote main is unobservable or no longer identifies the release commit after the push attempt; inspect origin/main before retrying. No tag or Release recovery command is safe yet.');
    }
    console.error(`BLOCK EH-RELEASE-001: ${error.message}`);
  }
  process.exitCode = 1;
} finally {
  if (!preserveRecovery && worktree && fs.existsSync(worktree)) {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: false,
    });
  }
  if (!preserveRecovery && branchName) {
    spawnSync('git', ['branch', '-D', branchName], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: false,
    });
  }
  if (!preserveRecovery && tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
