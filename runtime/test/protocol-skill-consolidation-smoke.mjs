import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skillsDir = path.join(root, 'skills');
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf-8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'harness/behavior-checks.json'), 'utf-8'));

for (const obsolete of ['harness-stage-executor', 'harness-stage-checker']) {
  assert.equal(fs.existsSync(path.join(skillsDir, obsolete)), false, `${obsolete} must not ship as a standalone skill`);
  assert.equal(plugin.skills.some((entry) => entry.includes(`/${obsolete}/`)), false, `${obsolete} must not be plugin-exposed`);
}
for (const contract of Object.values(registry.behaviors)) {
  assert.equal(contract.executorSkill, 'harness', `${contract.stage} executor must use shared harness contract`);
  assert.equal(contract.checkerSkill, 'harness', `${contract.stage} checker must use shared harness contract`);
}
console.log('PASS protocol-skill-consolidation verify');
