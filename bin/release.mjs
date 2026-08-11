import fs from 'node:fs';
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

function assertPreflight(tagName) {
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
  return local;
}

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
const nextVersion = bump(pkg.version, bumpType);
const tagName = `v${nextVersion}`;
console.log(`Release plan: ${pkg.version} -> ${nextVersion} (${tagName})`);
console.log('1. verify clean synchronized main and absent tag');
console.log('2. create isolated release worktree');
console.log('3. update package version and generate projections');
console.log('4. run prepublish, build allowlisted artifact, and verify artifact contents');
console.log('5. commit only version projections, tag, then push commit and tag separately');
if (dryRun) process.exit(0);

let tempRoot;
let worktree;
let branchName;
try {
  const sourceHead = assertPreflight(tagName);
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

  run('codegraph', ['init'], worktree);
  run('npm', ['run', 'prepublish-check'], worktree);
  run('npm', ['run', 'docs:check'], worktree);
  run(process.execPath, ['bin/package.mjs', '--out', 'dist'], worktree);
  run(process.execPath, ['runtime/test/artifact-content-smoke.mjs', 'verify'], worktree);

  const versionFiles = [
    'package.json',
    'harness/plugin/manifest.json',
    '.claude-plugin/plugin.json',
    '.claude-plugin/marketplace.json',
    'CHANGELOG.md',
  ];
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
  run('git', ['tag', tagName], worktree);
  run('git', ['push', 'origin', `HEAD:main`], worktree);
  run('git', ['push', 'origin', `refs/tags/${tagName}`], worktree);
  console.log(`Release ${nextVersion} pushed successfully.`);
} catch (error) {
  console.error(`BLOCK: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (worktree && fs.existsSync(worktree)) {
    spawnSync('git', ['worktree', 'remove', '--force', worktree], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: false,
    });
  }
  if (branchName) {
    spawnSync('git', ['branch', '-D', branchName], {
      cwd: repoRoot,
      encoding: 'utf-8',
      shell: false,
    });
  }
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
}
