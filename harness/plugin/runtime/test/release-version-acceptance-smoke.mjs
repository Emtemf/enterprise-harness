import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
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
  "['worktree', 'add'",
  "['bin/sync-version.mjs', '--quiet']",
  "['run', 'prepublish-check']",
  "['bin/package.mjs'",
  "['diff', '--cached', '--name-only']",
  "['push', 'origin', `HEAD:main`]",
  "['push', 'origin', `refs/tags/${tagName}`]",
]) {
  assert.ok(release.includes(token), `release is missing ${token}`);
}
assert.ok(release.includes("'CHANGELOG.md'"), 'release must stage the generated CHANGELOG section');
assert.doesNotMatch(release, /git', \['add', '-A'/u);
assert.doesNotMatch(release, /main', '--tags'/u);

const prepublish = fs.readFileSync(path.join(root, 'harness/plugin/runtime/prepublish.mjs'), 'utf-8');
for (const token of ['bin/run-smoke-suite.mjs', "['plugin', 'validate', '.']", 'zero warnings']) assert.ok(prepublish.includes(token), `prepublish missing ${token}`);
for (const workflow of ['.github/workflows/platform-smoke.yml', '.github/workflows/release.yml']) {
  const text = fs.readFileSync(path.join(root, workflow), 'utf-8');
  assert.match(text, /npm run prepublish-check/u, `${workflow} must block on P0 acceptance`);
  assert.match(text, /actions\/checkout@v7/u);
  assert.match(text, /actions\/setup-node@v7/u);
  assert.match(text, /@anthropic-ai\/claude-code@2\.1\.220/u);
}
const validation = spawnSync('claude', ['plugin', 'validate', '.'], {
  cwd: root,
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});
assert.equal(validation.status, 0, validation.stderr || validation.stdout);
assert.doesNotMatch(`${validation.stdout || ''}\n${validation.stderr || ''}`, /warning/iu, 'plugin validation must emit zero warnings');
console.log('PASS release-version-acceptance verify');
