import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const syncScript = path.join(sourceRoot, 'bin', 'sync-version.mjs');
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const projections = [
  'harness/plugin/manifest.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'test/skill-evals/harness/evals.json',
  'skills/plan/evals/evals.json',
];

function writeJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-sync-version-'));
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'harness', 'plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'test', 'skill-evals', 'harness'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'plan', 'evals'), { recursive: true });
  writeJson(path.join(root, 'package.json'), { name: 'fixture', version: '9.9.9' });
  writeJson(path.join(root, '.claude-plugin', 'plugin.json'), { name: 'enterprise-harness', version: '0.0.1' });
  writeJson(path.join(root, '.claude-plugin', 'marketplace.json'), {
    version: '0.0.1',
    plugins: [{ name: 'enterprise-harness', version: '0.0.1' }],
  });
  writeJson(path.join(root, 'harness', 'plugin', 'manifest.json'), { version: '0.0.1' });
  writeJson(path.join(root, 'test', 'skill-evals', 'harness', 'evals.json'), { version: '0.0.1', cases: [] });
  writeJson(path.join(root, 'skills', 'plan', 'evals', 'evals.json'), { version: '0.0.1', cases: [] });
  return root;
}

function run(root, args) {
  return spawnSync(process.execPath, [syncScript, ...args], {
    cwd: sourceRoot,
    encoding: 'utf-8',
    env: { ...process.env, ENTERPRISE_HARNESS_SYNC_ROOT: root },
    shell: false,
  });
}

function bytes(root) {
  return new Map(projections.map((relative) => [relative, fs.readFileSync(path.join(root, relative))]));
}

const root = fixtureRoot();
try {
  const before = bytes(root);
  const check = run(root, ['--check']);
  assert.notEqual(check.status, 0, 'sync-version --check must reject projection drift');
  assert.match(`${check.stdout}\n${check.stderr}`, /harness\/plugin\/manifest\.json|plugin\.json|marketplace\.json/u);
  for (const [relative, content] of before) {
    assert.deepEqual(fs.readFileSync(path.join(root, relative)), content,
      `--check must not write ${relative}`);
  }

  const generated = run(root, ['--quiet']);
  assert.equal(generated.status, 0, generated.stderr);
  const clean = run(root, ['--check']);
  assert.equal(clean.status, 0, clean.stderr);
  const checkAfterGeneration = bytes(root);
  assert.equal(run(root, ['--check']).status, 0);
  for (const [relative, content] of checkAfterGeneration) {
    assert.deepEqual(fs.readFileSync(path.join(root, relative)), content,
      `repeated --check must remain read-only for ${relative}`);
  }
  console.log(`PASS sync-version ${mode}`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
