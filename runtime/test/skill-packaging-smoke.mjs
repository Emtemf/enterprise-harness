import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSkillPackaging } from '../validators/skill-packaging-validator.mjs';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = path.resolve(process.env.EH_SKILL_PACKAGING_ROOT || sourceRoot);
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

if (mode === 'red') {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-skill-packaging-red-'));
  try {
    for (const entry of ['skills', 'agents', '.claude-plugin', 'package.json']) {
      fs.cpSync(path.join(sourceRoot, entry), path.join(fixture, entry), { recursive: true });
    }
    const manifestPath = path.join(fixture, '.claude-plugin', 'plugin.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifest.skills = manifest.skills.filter((entry) => entry !== './skills/test-design/');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'verify'], {
      cwd: sourceRoot,
      encoding: 'utf-8',
      env: { ...process.env, EH_SKILL_PACKAGING_ROOT: fixture },
      shell: false,
    });
    assert.notEqual(result.status, 0, 'missing test-design surface must fail packaging validation');
    assert.match(`${result.stdout}\n${result.stderr}`, /test-design/u);
    console.log('PASS skill-packaging red negative-mutation (missing test-design surface rejected)');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  process.exit(0);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
assert.equal(packageJson.version, '0.5.14', 'release package must declare 0.5.14');
assert.equal(plugin.version, packageJson.version, 'plugin projection must match package version');
assert.ok(plugin.skills.includes('./skills/test-design/'), 'installable plugin must expose the test-design Skill');
assert.ok(plugin.agents.includes('./agents/test-design-worker.md'), 'installable plugin must expose the test-design worker');

const result = validateSkillPackaging(path.resolve(root));
assert.deepEqual(
  result.problems.filter((problem) => /test-design|test-design-worker/u.test(problem)),
  [],
  'public test-design skill and worker must be in the packaging validator expected sets',
);
assert.ok(result.ok, `skill packaging violations:\n${result.problems.map((p) => `  - ${p}`).join('\n')}`);

console.log(`PASS skill-packaging ${mode}`);
