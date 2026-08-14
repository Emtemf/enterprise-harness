import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skill = (name) => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf-8');
const reviewer = fs.readFileSync(path.join(root, 'agents', 'reviewer.md'), 'utf-8');

for (const name of ['design', 'verify']) {
  const text = skill(name);
  assert.match(text, /NEEDS_DECISION/u, `${name} must return a decision request to main harness`);
  assert.match(text, /只有主 Harness 可以向用户提问|不得在该 forked methodology 中调用用户交互工具/u, `${name} must reserve user interaction for main harness`);
}
assert.match(reviewer, /unsupported/u);
assert.match(reviewer, /correction/u);
console.log('PASS main-owned-decisions verify');
