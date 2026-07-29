import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(root, 'harness/behavior-checks.json'), 'utf-8'));
const pluginHooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf-8')).hooks;
const localHooks = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8')).hooks;

for (const event of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'SubagentStart', 'SubagentStop', 'TaskCompleted', 'Stop']) {
  assert.ok(pluginHooks[event]?.length, `plugin hook missing ${event}`);
  assert.ok(localHooks[event]?.length, `local hook missing ${event}`);
}
for (const [name, behavior] of Object.entries(registry.behaviors)) {
  assert.ok(behavior.stage, `${name} missing stage`);
  assert.ok(behavior.executor, `${name} missing executor`);
  assert.ok(behavior.checker, `${name} missing checker`);
  assert.ok(behavior.artifact, `${name} missing artifact`);
}
assert.equal(registry.lifecycleHooks.includes('TaskCompleted'), true);
console.log(`PASS behavior-hook-registry ${process.argv[2] || 'verify'}`);
