import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const stageSkills = [
  'harness', 'harness-design', 'harness-plan',
  'harness-tdd', 'harness-verify',
];
const workerSkills = [];
const agents = [
  'code-explore', 'doc-research', 'tdd-executor', 'design-reviewer',
  'api-consistency-reviewer', 'plan-critic', 'verification-reviewer',
];
const check = () => {
  assert.equal(Object.hasOwn(plugin, 'commands'), false);
  assert.equal(fs.existsSync(path.join(root, '.claude-plugin/commands/harness.md')), false);
  for (const skill of stageSkills) {
    const text = read(`skills/${skill}/SKILL.md`);
    assert.match(text, /^---[\s\S]*?^name:\s*\S+/mu);
    assert.ok(text.includes('/enterprise-harness:harness'), `${skill} must name plugin entry`);
  }
  for (const skill of workerSkills) {
    const text = read(`skills/${skill}/SKILL.md`);
    assert.match(text, /^---[\s\S]*?^name:\s*\S+/mu);
    assert.match(text, /^user-invocable:\s*false$/mu, `${skill} is a worker contract, not a user entry`);
  }
  for (const agent of agents) {
    const text = read(`agents/${agent}.md`);
    assert.match(text, new RegExp(`^name:\\s*${agent}$`, 'm'));
    assert.doesNotMatch(text, new RegExp(`^name:\\s*enterprise-harness:${agent}$`, 'm'));
  }
  assert.match(read('agents/tdd-executor.md'), /^isolation:\s*worktree$/m);
  assert.ok(read('agents/code-explore.md').includes('name: code-explore'));
  assert.doesNotMatch(stageSkills.map((skill) => read(`skills/${skill}/SKILL.md`)).join('\n'), /fallback.*general-purpose/iu);
};
try {
  check();
  if (mode === 'red') process.exit(1);
  console.log(`PASS plugin-entry-agent-contract ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(mode === 'red' ? 0 : 1);
}
