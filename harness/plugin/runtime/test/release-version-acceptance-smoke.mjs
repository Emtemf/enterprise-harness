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
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8');
const readmeVersion = readme.match(/^# Enterprise Harness \(v([^)]+)\)/u)?.[1];
assert.deepEqual(new Set([pkg.version, plugin.version, runtime.version, marketplace.version, marketplace.plugins?.[0]?.version, readmeVersion]), new Set([pkg.version]), 'all five release projections and README must match');

const release = fs.readFileSync(path.join(root, 'bin/release.mjs'), 'utf-8');
const preflightAt = release.indexOf("spawnSync('npm', ['run', 'prepublish-check']");
assert.ok(preflightAt > 0, 'release must execute prepublish-check');
for (const mutation of ['fs.writeFileSync(pkgPath', "spawnSync('git', ['add'", "spawnSync('git', ['tag'", "spawnSync('git', ['push'"]) {
  assert.ok(release.indexOf(mutation) > preflightAt, `${mutation} must occur after prepublish acceptance`);
}
for (const token of ['marketplace.version = newVersion', 'entry.version = newVersion', 'README']) assert.match(release, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));

const prepublish = fs.readFileSync(path.join(root, 'harness/plugin/runtime/prepublish.mjs'), 'utf-8');
for (const token of ['task1-authoritative-evidence-smoke.mjs', 'task2-plugin-agent-smoke.mjs', 'task3-gate-completion-smoke.mjs', 'release-version-acceptance-smoke.mjs', "['plugin', 'validate', '.']", 'zero warnings']) assert.ok(prepublish.includes(token), `prepublish missing ${token}`);
for (const workflow of ['.github/workflows/platform-smoke.yml', '.github/workflows/release.yml']) {
  assert.match(fs.readFileSync(path.join(root, workflow), 'utf-8'), /npm run prepublish-check/u, `${workflow} must block on P0 acceptance`);
}
const validation = spawnSync('claude', ['plugin', 'validate', '.'], { cwd: root, encoding: 'utf-8', shell: false });
assert.equal(validation.status, 0, validation.stderr || validation.stdout);
assert.doesNotMatch(`${validation.stdout || ''}\n${validation.stderr || ''}`, /warning/iu, 'plugin validation must emit zero warnings');
console.log('PASS release-version-acceptance verify');
