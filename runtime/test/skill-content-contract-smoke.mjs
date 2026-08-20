import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillContent } from '../validators/skill-content-validator.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const current = validateSkillContent(root);
assert.ok(current.ok, `skill content violations:\n${current.problems.map((problem) => `  - ${problem}`).join('\n')}`);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'eh-skill-content-'));
try {
  fs.cpSync(path.join(root, 'skills'), path.join(sandbox, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(sandbox, 'hooks'), { recursive: true });
  const designSkill = path.join(sandbox, 'skills', 'design', 'SKILL.md');
  const originalSkill = fs.readFileSync(designSkill, 'utf-8');

  fs.writeFileSync(designSkill, originalSkill.replace('Use when clarify', 'Run after clarify'));
  let invalid = validateSkillContent(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('description must state')));
  fs.writeFileSync(designSkill, originalSkill);

  const methodPath = path.join(sandbox, 'skills', 'design', 'references', 'method.md');
  const originalMethod = fs.readFileSync(methodPath, 'utf-8');
  fs.writeFileSync(methodPath, originalMethod.replace('## Failure modes', '## Common mistakes'));
  invalid = validateSkillContent(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('missing "## Failure modes"')));
  fs.writeFileSync(methodPath, originalMethod);

  const evalsPath = path.join(sandbox, 'skills', 'design', 'evals', 'evals.json');
  const evals = JSON.parse(fs.readFileSync(evalsPath, 'utf-8'));
  for (const testCase of evals.cases) {
    delete testCase.prompt;
    delete testCase.expectedBehavior;
  }
  fs.writeFileSync(evalsPath, `${JSON.stringify(evals, null, 2)}\n`);
  invalid = validateSkillContent(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('observable expectedBehavior')));

  fs.writeFileSync(path.join(sandbox, 'hooks', 'sop-loader.mjs'), "readFileSync('skills/design/references/method.md');\n");
  invalid = validateSkillContent(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('Hook must not load Skill method content')));

  fs.writeFileSync(designSkill, `${originalSkill}${'\nstanding instruction'.repeat(500)}\n`);
  invalid = validateSkillContent(sandbox);
  assert.ok(invalid.problems.some((problem) => problem.includes('below 500 lines')));
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`PASS skill-content-contract ${process.argv[2] || 'verify'}`);
