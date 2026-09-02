import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (process.platform === 'win32') {
  console.log(`PASS release-local-transaction ${mode} (POSIX process-stub coverage)`);
  process.exit(0);
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-release-transaction-'));

function run(command, args, cwd, options = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf-8',
    shell: false,
    ...options,
  });
}

function mustRun(command, args, cwd, options = {}) {
  const result = run(command, args, cwd, options);
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return String(result.stdout || '').trim();
}

function writeExecutable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o755 });
}

function makeFixture(name, { rejectTags = false, rejectMain = false, advanceMain = false } = {}) {
  const fixtureRoot = path.join(sandbox, name);
  const source = path.join(fixtureRoot, 'source');
  const remote = path.join(fixtureRoot, 'remote.git');
  const fakeBin = path.join(fixtureRoot, 'fake-bin');
  fs.mkdirSync(path.join(source, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'harness', 'plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(source, 'test', 'skill-evals', 'harness'), { recursive: true });
  fs.mkdirSync(path.join(source, 'skills', 'plan', 'evals'), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.copyFileSync(path.join(root, 'bin', 'release.mjs'), path.join(source, 'bin', 'release.mjs'));
  fs.copyFileSync(path.join(root, 'bin', 'sync-version.mjs'), path.join(source, 'bin', 'sync-version.mjs'));
  fs.writeFileSync(path.join(source, 'package.json'), `${JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2)}\n`);
  fs.writeFileSync(path.join(source, 'package-lock.json'), `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'fixture', version: '1.0.0' } },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(source, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n');
  fs.writeFileSync(path.join(source, 'README.md'), '# fixture\n');
  fs.writeFileSync(path.join(source, 'harness', 'plugin', 'manifest.json'), '{"version":"1.0.0"}\n');
  fs.writeFileSync(path.join(source, '.claude-plugin', 'plugin.json'), '{"name":"fixture","version":"1.0.0"}\n');
  fs.writeFileSync(
    path.join(source, '.claude-plugin', 'marketplace.json'),
    '{"version":"1.0.0","plugins":[{"name":"fixture","version":"1.0.0"}]}\n',
  );
  fs.writeFileSync(path.join(source, 'test', 'skill-evals', 'harness', 'evals.json'), '{"version":"1.0.0","cases":[]}\n');
  fs.writeFileSync(path.join(source, 'skills', 'plan', 'evals', 'evals.json'), '{"version":"1.0.0","cases":[]}\n');
  fs.writeFileSync(path.join(source, 'bin', 'local-quality.mjs'), `
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const out = path.resolve(args[args.indexOf('--out') + 1]);
const version = args[args.indexOf('--release-version') + 1];
if (process.env.FAKE_QUALITY_MUTATE === '1') fs.appendFileSync('README.md', 'mutation\\n');
const injected = 'bin/untracked-release-input.mjs';
if (process.env.FAKE_QUALITY_UNTRACKED === '1') fs.writeFileSync(injected, 'export default true;\\n');
fs.mkdirSync(out, { recursive: true });
const files = process.env.FAKE_QUALITY_UNTRACKED === '1' ? [injected] : [];
for (const [name, body] of [
  [\`enterprise-harness-\${version}.tar.gz\`, 'tar'],
  ['manifest-files.json', JSON.stringify({ files: files.map((file) => { const content = fs.readFileSync(file); return { path: file, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') }; }) })],
  ['SHA256SUMS', 'sum'],
  ['sbom.cdx.json', '{}'],
  ['release-notes.md', 'notes'],
]) fs.writeFileSync(path.join(out, name), body);
`);

  const ghLog = path.join(fixtureRoot, 'gh.log');
  writeExecutable(path.join(fakeBin, 'codegraph'), '#!/bin/sh\nexit 0\n');
  writeExecutable(path.join(fakeBin, 'gh'), `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'auth') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') { console.log('ADMIN'); process.exit(0); }
if (args[0] === 'release' && args[1] === 'create' && process.env.FAKE_GH_FAIL_RELEASE === '1') process.exit(42);
process.exit(0);
`);

  mustRun('git', ['init', '--bare', remote], fixtureRoot);
  mustRun('git', ['init', '-b', 'main'], source);
  mustRun('git', ['config', 'user.name', 'Release Test'], source);
  mustRun('git', ['config', 'user.email', 'release@example.invalid'], source);
  mustRun('git', ['add', '.'], source);
  mustRun('git', ['commit', '-m', 'initial'], source);
  const githubUrl = `https://github.com/example/${name}.git`;
  mustRun('git', ['remote', 'add', 'origin', githubUrl], source);
  mustRun('git', ['config', `url.${remote}.insteadOf`, githubUrl], source);
  mustRun('git', ['push', '-u', 'origin', 'main'], source);
  if (rejectTags || rejectMain) {
    const hook = path.join(remote, 'hooks', 'pre-receive');
    const rejectedRef = rejectTags ? 'refs/tags/*' : 'refs/heads/main';
    writeExecutable(hook, `#!/bin/sh\nwhile read old new ref; do case "$ref" in ${rejectedRef}) exit 1;; esac; done\nexit 0\n`);
  }
  if (advanceMain) {
    const hook = path.join(remote, 'hooks', 'post-receive');
    writeExecutable(hook, `#!/bin/sh
while read old new ref; do
  if [ "$ref" = "refs/heads/main" ] && [ "$old" != "0000000000000000000000000000000000000000" ]; then
    tree=$(git rev-parse "$new^{tree}")
    advanced=$(printf 'concurrent advance\\n' | git -c user.name='Concurrent Test' -c user.email='concurrent@example.invalid' commit-tree "$tree" -p "$new")
    git update-ref refs/heads/main "$advanced" "$new"
  fi
done
`);
  }
  return {
    source,
    remote,
    ghLog,
    env: {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: ghLog,
    },
  };
}

function release(fixture, extraEnv = {}) {
  return run(process.execPath, ['bin/release.mjs', '--patch'], fixture.source, {
    env: { ...fixture.env, ...extraEnv },
  });
}

try {
  const sourceMutation = makeFixture('source-mutation');
  const mutationResult = release(sourceMutation, { FAKE_QUALITY_MUTATE: '1' });
  assert.equal(mutationResult.status, 1);
  assert.match(mutationResult.stderr, /EH-RELEASE-SOURCE-002/u);
  assert.match(
    mustRun('git', ['--git-dir', sourceMutation.remote, 'show', 'refs/heads/main:package.json'], sandbox),
    /"version": "1\.0\.0"/u,
    'tracked mutation must block before remote main changes',
  );

  const untrackedInput = makeFixture('untracked-input');
  const untrackedResult = release(untrackedInput, { FAKE_QUALITY_UNTRACKED: '1' });
  assert.equal(untrackedResult.status, 1);
  assert.match(untrackedResult.stderr, /EH-RELEASE-SOURCE-002/u);
  assert.match(
    mustRun('git', ['--git-dir', untrackedInput.remote, 'show', 'refs/heads/main:package.json'], sandbox),
    /"version": "1\.0\.0"/u,
    'untracked package input must block before remote main changes',
  );

  const rejectedMain = makeFixture('rejected-main', { rejectMain: true });
  const mainFailure = release(rejectedMain);
  assert.equal(mainFailure.status, 1);
  assert.match(mainFailure.stderr, /EH-RELEASE-001/u);
  assert.doesNotMatch(mainFailure.stderr, /EH-RELEASE-PARTIAL-002|RECOVERY_TAG_ARGV|RECOVERY_RELEASE_ARGV/u);
  assert.match(
    mustRun('git', ['--git-dir', rejectedMain.remote, 'show', 'refs/heads/main:package.json'], sandbox),
    /"version": "1\.0\.0"/u,
  );

  const concurrentMain = makeFixture('concurrent-main', { advanceMain: true });
  const concurrentFailure = release(concurrentMain);
  assert.equal(concurrentFailure.status, 1);
  assert.match(concurrentFailure.stderr, /EH-RELEASE-001[\s\S]*EH-RELEASE-REMOTE-005/u);
  assert.doesNotMatch(concurrentFailure.stderr, /RECOVERY_TAG_ARGV|RECOVERY_RELEASE_ARGV/u);
  const concurrentWorktree = concurrentFailure.stderr.match(/^RECOVERY_WORKTREE=(.+)$/mu)?.[1];
  assert.ok(concurrentWorktree && fs.existsSync(path.join(concurrentWorktree, 'dist', 'release-notes.md')));

  const missingRelease = makeFixture('missing-release');
  const releaseFailure = release(missingRelease, { FAKE_GH_FAIL_RELEASE: '1' });
  assert.equal(releaseFailure.status, 1);
  assert.match(releaseFailure.stderr, /EH-RELEASE-PARTIAL-002/u);
  const preserved = releaseFailure.stderr.match(/^RECOVERY_WORKTREE=(.+)$/mu)?.[1];
  assert.ok(preserved && fs.existsSync(path.join(preserved, 'dist', 'release-notes.md')));
  const remoteMain = mustRun('git', ['--git-dir', missingRelease.remote, 'rev-parse', 'refs/heads/main'], sandbox);
  const remoteTag = mustRun('git', ['--git-dir', missingRelease.remote, 'rev-parse', 'refs/tags/v1.0.1'], sandbox);
  assert.equal(remoteTag, remoteMain, 'published tag must identify the release commit');
  const ghCalls = fs.readFileSync(missingRelease.ghLog, 'utf-8').trim().split('\n').map(JSON.parse);
  const create = ghCalls.find((args) => args[0] === 'release' && args[1] === 'create');
  assert.ok(create, 'release create must be attempted');
  assert.equal(create[create.indexOf('--repo') + 1], 'example/missing-release');
  assert.ok(create.includes('--verify-tag'));
  const releaseRecovery = JSON.parse(releaseFailure.stderr.match(/^RECOVERY_RELEASE_ARGV=(.+)$/mu)?.[1]);
  const recoveredRelease = run(releaseRecovery[0], releaseRecovery.slice(1), preserved, { env: missingRelease.env });
  assert.equal(recoveredRelease.status, 0, recoveredRelease.stderr);

  const rejectedTag = makeFixture('rejected-tag', { rejectTags: true });
  const tagFailure = release(rejectedTag);
  assert.equal(tagFailure.status, 1);
  assert.match(tagFailure.stderr, /EH-RELEASE-PARTIAL-002/u);
  const tagWorktree = tagFailure.stderr.match(/^RECOVERY_WORKTREE=(.+)$/mu)?.[1];
  assert.ok(tagWorktree);
  const tagRecovery = JSON.parse(tagFailure.stderr.match(/^RECOVERY_TAG_ARGV=(.+)$/mu)?.[1]);
  fs.rmSync(path.join(rejectedTag.remote, 'hooks', 'pre-receive'));
  const recoveredTag = run(tagRecovery[0], tagRecovery.slice(1), tagWorktree, { env: rejectedTag.env });
  assert.equal(recoveredTag.status, 0, recoveredTag.stderr);
  const rejectedReleaseRecovery = JSON.parse(tagFailure.stderr.match(/^RECOVERY_RELEASE_ARGV=(.+)$/mu)?.[1]);
  const recoveredRejectedRelease = run(
    rejectedReleaseRecovery[0],
    rejectedReleaseRecovery.slice(1),
    tagWorktree,
    { env: rejectedTag.env },
  );
  assert.equal(recoveredRejectedRelease.status, 0, recoveredRejectedRelease.stderr);
  assert.equal(
    run('git', ['--git-dir', rejectedTag.remote, 'show-ref', '--verify', '--quiet', 'refs/tags/v1.0.1'], sandbox).status,
    0,
    'explicit recovery argv must publish the previously rejected tag',
  );

  console.log(`PASS release-local-transaction ${mode}`);
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
