import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { selectRubrics } from '../../skills/review/scripts/select-rubrics.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const policy = JSON.parse(fs.readFileSync(path.join(root, 'harness', 'policy.json'), 'utf-8'));
assert.equal(Object.hasOwn(policy, 'rubricToReviewer'), false, 'policy.json must not duplicate rubric ownership');
for (const [stage, contract] of Object.entries(policy.stages)) {
  assert.equal(Object.hasOwn(contract, 'rubrics'), false, `policy.json stage ${stage} must not duplicate rubric selection`);
}

const selected = selectRubrics({
  stage: 'design',
  impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no', security: 'yes' },
});
assert.deepEqual(selected, ['design', 'api', 'architecture', 'security']);

for (const id of selected) {
  assert.equal(fs.existsSync(path.join(root, 'skills', 'review', 'references', `${id}.md`)), true, `missing ${id} rubric`);
}

const allSelected = new Set();
for (const stage of ['clarify', 'design', 'plan', 'implement', 'verify', 'archive']) {
  for (const id of selectRubrics({
    stage,
    impact: { api: 'yes', data: 'yes', architecture: 'yes', rule: 'yes', security: 'yes' },
  })) allSelected.add(id);
}
for (const id of allSelected) {
  assert.equal(
    fs.existsSync(path.join(root, 'skills', 'review', 'references', `${id}.md`)),
    true,
    `runtime selects missing rubric ${id}`,
  );
}

console.log(`PASS review-rubric-selector ${mode}`);
