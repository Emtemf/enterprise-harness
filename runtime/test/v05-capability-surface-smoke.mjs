import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf-8'));
const expectedSkills = ['harness', 'explore-code', 'research-docs', 'design', 'test-design', 'plan', 'implement', 'review', 'verify', 'archive'];
const expectedAgents = ['code-explore', 'doc-research', 'artifact-worker', 'test-design-worker', 'implementer', 'reviewer'];

assert.deepEqual(
  plugin.skills.map((entry) => path.basename(entry.replace(/\/+$/u, ''))),
  expectedSkills,
  'v0.5 plugin manifest must expose the canonical methodology skills',
);
assert.deepEqual(
  plugin.agents.map((entry) => path.basename(entry, '.md')),
  expectedAgents,
  'v0.5 plugin manifest must expose the capability agents',
);
for (const skill of expectedSkills) {
  assert.ok(fs.existsSync(path.join(root, 'skills', skill, 'SKILL.md')), `missing canonical skill ${skill}`);
}
for (const agent of expectedAgents) {
  assert.ok(fs.existsSync(path.join(root, 'agents', `${agent}.md`)), `missing canonical agent ${agent}`);
}
console.log('PASS v05-capability-surface verify');
