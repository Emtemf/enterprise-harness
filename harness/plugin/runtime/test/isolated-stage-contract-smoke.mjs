import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf-8'));
const registry = JSON.parse(fs.readFileSync(path.join(root, 'harness/behavior-checks.json'), 'utf-8'));

assert.ok(plugin.skills.includes('./.claude/skills/harness-stage-executor/'));
assert.ok(plugin.skills.includes('./.claude/skills/harness-stage-checker/'));
for (const behavior of Object.values(registry.behaviors)) {
  assert.notEqual(behavior.executor, behavior.checker, 'executor and checker must be different agents');
  assert.equal(behavior.executorSkill, 'harness-stage-executor');
  assert.equal(behavior.checkerSkill, 'harness-stage-checker');
  const executorFile = path.join(root, '.claude/agents', `${behavior.executor.split(':')[1]}.md`);
  const checkerFile = path.join(root, '.claude/agents', `${behavior.checker.split(':')[1]}.md`);
  assert.equal(fs.existsSync(executorFile), true, executorFile);
  assert.equal(fs.existsSync(checkerFile), true, checkerFile);
  assert.match(fs.readFileSync(executorFile, 'utf-8'), /skills:\s*\n\s+- harness-stage-executor/u);
  assert.match(fs.readFileSync(checkerFile, 'utf-8'), /skills:\s*\n\s+- harness-stage-checker/u);
}

const orchestrator = fs.readFileSync(path.join(root, '.claude/skills/harness/SKILL.md'), 'utf-8');
assert.match(orchestrator, /subagent 不能再派生 subagent/u);
assert.match(orchestrator, /HANDOFF_INPUT/u);
assert.match(orchestrator, /executor subagent/u);
assert.match(orchestrator, /checker subagent/u);
console.log(`PASS isolated-stage-contract ${process.argv[2] || 'verify'}`);
