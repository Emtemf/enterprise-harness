import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const skill = fs.readFileSync(path.join(root, 'skills', 'test-design', 'SKILL.md'), 'utf-8');

try {
  assert.match(skill, /^user-invocable: false$/mu);
  assert.match(skill, /^context: fork$/mu);
  assert.match(skill, /^agent: enterprise-harness:test-design-worker$/mu);
  assert.match(skill, /^argument-hint: HANDOFF_INPUT=<canonical-input\.json-path>$/mu);
  assert.doesNotMatch(skill, /^background:/mu);
  if (mode === 'red') process.exit(1);
  console.log(`PASS test-design-skill-wiring ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(mode === 'red' ? 0 : 1);
}
