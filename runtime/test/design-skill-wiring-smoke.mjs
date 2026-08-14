import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const skillDir = path.join(root, 'skills', 'design');
const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');

assert.match(skill, /^agent: enterprise-harness:artifact-worker$/mu);
assert.match(skill, /^background: false$/mu);
for (const file of [
  'references/method.md',
  'references/artifact-contract.md',
  'references/self-check.md',
  'references/api-design.md',
  'references/data-design.md',
  'references/examples.md',
  'scripts/prepare-input.mjs',
  'scripts/finalize-result.mjs',
  'assert/artifact-shape.mjs',
  'assert/requirement-coverage.mjs',
  'assert/traceability.mjs',
]) {
  assert.equal(fs.existsSync(path.join(skillDir, file)), true, `missing ${file}`);
  assert.match(skill, new RegExp('`' + file.replaceAll('.', '\\.') + '`', 'u'), `SKILL.md must wire ${file}`);
}

console.log(`PASS design-skill-wiring ${mode}`);
