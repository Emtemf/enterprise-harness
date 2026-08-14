import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { selectRubrics } from '../../skills/review/scripts/select-rubrics.mjs';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const selected = selectRubrics({
  stage: 'design',
  impact: { api: 'yes', data: 'no', architecture: 'yes', rule: 'no', security: 'yes' },
});
assert.deepEqual(selected, ['design', 'api', 'architecture', 'security']);

for (const id of selected) {
  assert.equal(fs.existsSync(path.join(root, 'skills', 'review', 'references', `${id}.md`)), true, `missing ${id} rubric`);
}

console.log(`PASS review-rubric-selector ${mode}`);
