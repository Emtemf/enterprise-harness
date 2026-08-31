import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { validateSkillPackaging } from '../validators/skill-packaging-validator.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
assert.equal(packageJson.version, '0.5.12', 'release package must declare 0.5.12');
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
