import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  V6_CAPABILITY_AGENT_TYPES,
  isV6CapabilityAgentType,
} from '../lib/agent-evidence.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
const skills = ['harness', 'explore-code', 'research-docs', 'design', 'plan', 'implement', 'review', 'verify', 'archive'];
const agents = ['code-explore', 'doc-research', 'artifact-worker', 'implementer', 'reviewer'];

const check = () => {
  assert.equal(Object.hasOwn(plugin, 'commands'), false);
  assert.equal(fs.existsSync(path.join(root, '.claude-plugin/commands/harness.md')), false);
  for (const skill of skills) {
    const text = read(`skills/${skill}/SKILL.md`);
    assert.match(text, /^---[\s\S]*?^name:\s*\S+/mu);
    if (skill !== 'harness') assert.match(text, /^user-invocable:\s*false$/mu, `${skill} is methodology, not a user entry`);
  }
  assert.deepEqual([...V6_CAPABILITY_AGENT_TYPES], agents);
  for (const agent of agents) {
    const text = read(`agents/${agent}.md`);
    assert.match(text, new RegExp(`^name:\\s*${agent}$`, 'm'));
    assert.doesNotMatch(text, new RegExp(`^name:\\s*enterprise-harness:${agent}$`, 'm'));
    assert.equal(isV6CapabilityAgentType(agent), true);
    assert.equal(isV6CapabilityAgentType(`enterprise-harness:${agent}`), true);
  }
  assert.equal(isV6CapabilityAgentType('enterprise-harness:tdd-executor'), false);
  assert.equal(isV6CapabilityAgentType('enterprise-harness:design-executor'), false);
  assert.match(read('agents/implementer.md'), /^isolation:\s*worktree$/m);
  assert.ok(read('agents/code-explore.md').includes('name: code-explore'));
  assert.match(read('skills/harness/SKILL.md'), /AskUserQuestion/u);
};
try {
  check();
  if (mode === 'red') process.exit(1);
  console.log(`PASS plugin-entry-agent-contract ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(mode === 'red' ? 0 : 1);
}
