import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const skill = fs.readFileSync(path.join(root, 'skills', 'test-design', 'SKILL.md'), 'utf-8');

const task3Files = [
  'skills/test-design/assets/test-cases.md.tmpl',
  'skills/test-design/references/method.md',
  'skills/test-design/references/artifact-contract.md',
  'skills/test-design/references/self-check.md',
  'skills/test-design/references/examples.md',
  'skills/test-design/assert/artifact-shape.mjs',
  'skills/test-design/assert/coverage.mjs',
  'skills/test-design/assert/traceability.mjs',
  'skills/test-design/evals/evals.json',
  'skills/review/references/test-design.md',
];

try {
  assert.match(skill, /^user-invocable: false$/mu);
  assert.match(skill, /^context: fork$/mu);
  assert.match(skill, /^agent: enterprise-harness:test-design-worker$/mu);
  assert.match(skill, /^argument-hint: HANDOFF_INPUT=<canonical-input\.json-path>$/mu);
  assert.doesNotMatch(skill, /^background:/mu);
  for (const relativePath of task3Files) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `missing Task 3 support file: ${relativePath}`);
  }
  assert.equal(fs.existsSync(path.join(root, 'skills/test-design/scripts/prepare-input.mjs')), false, 'prepare-input belongs to Task 4');
  assert.equal(fs.existsSync(path.join(root, 'skills/test-design/scripts/finalize-result.mjs')), false, 'finalizer belongs to Task 4');
  assert.match(skill, /marker prepare/u);
  assert.match(skill, /冻结输入/u);
  assert.match(skill, /assets\/test-cases\.md\.tmpl/u);
  assert.match(skill, /Test Design Self-Check/u);
  assert.match(skill, /Task 4/u);
  assert.match(skill, /Main.*独立.*review/iu);
  assert.match(skill, /不执行测试/u);
  assert.match(skill, /不.*浏览器/u);
  assert.match(skill, /不.*exact argv/u);
  assert.match(skill, /NEEDS_DECISION/u);
  console.log(`PASS test-design-skill-wiring ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
