import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registry = JSON.parse(fs.readFileSync(path.join(root, 'runtime/compat/v5/behavior-checks.json'), 'utf-8'));
const pluginHooks = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf-8')).hooks;
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));

// v0.5: governance hooks live ONLY in plugin hooks.json, not settings.json
assert.equal(settings.hooks, undefined, 'settings.json must not contain governance hooks (Controller/Subject isolation)');

for (const event of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop']) {
  assert.ok(pluginHooks[event]?.length, `plugin hook missing ${event}`);
}
for (const event of ['SubagentStart', 'SubagentStop', 'TaskCompleted']) {
  assert.equal(pluginHooks[event], undefined, `plugin must not use ${event} as a lifecycle authority`);
}
for (const [name, behavior] of Object.entries(registry.behaviors)) {
  assert.ok(behavior.stage, `${name} missing stage`);
  assert.ok(behavior.executor, `${name} missing executor`);
  assert.ok(behavior.checker, `${name} missing checker`);
  assert.ok(behavior.artifact, `${name} missing artifact`);
}
assert.equal(registry.lifecycleHooks.includes('TaskCompleted'), true);
console.log(`PASS behavior-hook-registry ${process.argv[2] || 'verify'}`);
