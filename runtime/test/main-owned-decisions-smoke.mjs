import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const skill = (name) => fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf-8');
const verificationExecutor = fs.readFileSync(path.join(root, 'agents', 'verification-executor.md'), 'utf-8');

for (const name of ['harness-design', 'harness-verify']) {
  const text = skill(name);
  assert.match(text, /NEEDS_DECISION/u, `${name} must return a decision request to the main harness`);
  assert.match(text, /不得\*{0,2}调用 `AskUserQuestion`/u, `${name} must reserve user interaction for main harness`);
}
assert.match(verificationExecutor, /verify\.collect/u);
assert.match(verificationExecutor, /verify\.check-api/u);

console.log('PASS main-owned-decisions verify');
