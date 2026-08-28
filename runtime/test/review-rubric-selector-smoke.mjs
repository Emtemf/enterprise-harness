import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { selectRubrics } from '../../skills/review/scripts/select-rubrics.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const impact = { api: 'yes', data: 'no', architecture: 'yes', rule: 'no', security: 'yes' };
const architectureSelected = selectRubrics({
  stage: 'design',
  behavior: 'design.produce',
  impact,
});
assert.deepEqual(architectureSelected, ['design', 'api', 'architecture', 'security']);
assert.deepEqual(
  selectRubrics({ stage: 'design', behavior: 'design.review', impact }),
  architectureSelected,
  'architecture check behavior must select the architecture rubric chain explicitly',
);

const testDesignSelected = selectRubrics({
  stage: 'design',
  behavior: 'design.test-cases',
  impact,
});
assert.deepEqual(testDesignSelected, ['test-design', 'api', 'architecture', 'security']);
assert.deepEqual(
  selectRubrics({ stage: 'design', behavior: 'design.test-cases.review', impact }),
  testDesignSelected,
  'test-design check behavior must select the test-design rubric chain explicitly',
);
assert.throws(
  () => selectRubrics({ stage: 'design', impact }),
  /EH-RUBRIC-SELECT-001.*behavior/iu,
  'Design rubric selection must not fall back when behavior is missing',
);
assert.throws(
  () => selectRubrics({ stage: 'design', behavior: 'design.test-cases.extra', impact }),
  /EH-RUBRIC-SELECT-001.*unsupported.*behavior/iu,
  'Design rubric selection must exact-match behavior',
);

for (const id of new Set([...architectureSelected, ...testDesignSelected])) {
  assert.equal(fs.existsSync(path.join(root, 'skills', 'review', 'references', `${id}.md`)), true, `missing ${id} rubric`);
}

const reviewSkill = fs.readFileSync(path.join(root, 'skills/review/SKILL.md'), 'utf-8');
assert.match(reviewSkill, /按 stage、behavior 与 classification/u);
assert.match(reviewSkill, /references\/test-design\.md/u);

const policy = JSON.parse(fs.readFileSync(path.join(root, 'harness/policy.json'), 'utf-8'));
assert.ok(policy.stages.design.rubrics.includes('test-design'));
assert.equal(policy.rubricToReviewer['test-design'], 'reviewer');

console.log(`PASS review-rubric-selector ${mode}`);
