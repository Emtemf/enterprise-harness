import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8'));
const pkg = readJson('package.json');
const plugin = readJson('.claude-plugin/plugin.json');
const runtime = readJson('harness/plugin/manifest.json');
const marketplace = readJson('.claude-plugin/marketplace.json');
assert.deepEqual(
  new Set([pkg.version, plugin.version, runtime.version, marketplace.version, marketplace.plugins?.[0]?.version]),
  new Set([pkg.version]),
  'generated release projections must match package.json',
);

const release = fs.readFileSync(path.join(root, 'bin/release.mjs'), 'utf-8');
for (const token of [
  "['status', '--porcelain']",
  "['branch', '--show-current']",
  "['rev-parse', 'origin/main']",
  "['auth', 'status'",
  "['worktree', 'add'",
  "['bin/sync-version.mjs', '--quiet']",
  "['bin/local-quality.mjs'",
  "['diff', '--cached', '--name-only']",
  "['push', 'origin', `HEAD:main`]",
  "['push', 'origin', `refs/tags/${tagName}`]",
  "'release', 'create'",
  "'--verify-tag'",
]) {
  assert.ok(release.includes(token), `release is missing ${token}`);
}
assert.ok(release.includes("'CHANGELOG.md'"), 'release must stage the generated CHANGELOG section');
const packager = fs.readFileSync(path.join(root, 'bin/package.mjs'), 'utf-8');
assert.match(packager, /'harness\/plugin'/u, 'release package must include the runtime version manifest');
assert.doesNotMatch(release, /git', \['add', '-A'/u);
assert.doesNotMatch(release, /main', '--tags'/u);

const prepublish = fs.readFileSync(path.join(root, 'runtime/prepublish.mjs'), 'utf-8');
for (const token of [
  "['bin/sync-version.mjs', '--check']",
  'bin/run-smoke-suite.mjs',
  "['runtime/cli.mjs', 'bootstrap']",
  "['runtime/cli.mjs', 'verify', '--release-surface']",
  "['plugin', 'validate', '.']",
  'zero warnings',
]) assert.ok(prepublish.includes(token), `prepublish missing ${token}`);
assert.ok(
  prepublish.indexOf("['runtime/cli.mjs', 'bootstrap']")
    < prepublish.indexOf("['runtime/cli.mjs', 'sync', '--json']"),
  'prepublish must bootstrap an isolated checkout before readiness validation',
);
const runtimeTestDir = path.join(root, 'runtime/test');
const forbiddenDeveloperRoots = ['/home' + '/', 'C:' + '\\Users\\'];
for (const entry of fs.readdirSync(runtimeTestDir, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
  const source = fs.readFileSync(path.join(runtimeTestDir, entry.name), 'utf-8');
  for (const forbidden of forbiddenDeveloperRoots) {
    assert.equal(
      source.includes(forbidden),
      false,
      `${entry.name} must resolve repository paths dynamically instead of embedding ${forbidden}`,
    );
  }
}
const localQuality = fs.readFileSync(path.join(root, 'bin/local-quality.mjs'), 'utf-8');
for (const token of [
  'runtime/prepublish.mjs',
  'test/external-project/maven-lifecycle-e2e.mjs',
  'bin/package.mjs',
  'runtime/test/artifact-content-smoke.mjs',
  'bin/sbom.mjs',
  'bin/release-notes.mjs',
  'bin/validate-artifact.mjs',
]) assert.ok(localQuality.includes(token), `local quality gate is missing ${token}`);
const validation = spawnSync('claude', ['plugin', 'validate', '.'], {
  cwd: root,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});
assert.equal(validation.status, 0, validation.stderr || validation.stdout);
assert.doesNotMatch(`${validation.stdout || ''}\n${validation.stderr || ''}`, /warning/iu, 'plugin validation must emit zero warnings');
console.log('PASS release-version-acceptance verify');
