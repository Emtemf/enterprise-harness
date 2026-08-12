import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8'));
const manifest = readJson('harness/plugin/hooks-manifest.json');
const settings = readJson('.claude/settings.json');
const packagedHooks = readJson('hooks/hooks.json');

for (const [name, config] of [
  ['source hook manifest', manifest.hooks],
  ['project settings', settings.hooks],
  ['packaged hook manifest', packagedHooks.hooks],
]) {
  assert.equal(Object.hasOwn(config, 'WorktreeCreate'), false, `${name} must not override Claude Code native WorktreeCreate`);
  assert.equal(Object.hasOwn(config, 'WorktreeRemove'), false, `${name} must not override Claude Code native WorktreeRemove`);
}
assert.deepEqual(settings.worktree, { baseRef: 'head' }, 'native worktree policy must remain enabled');
console.log('PASS native-worktree-registration verify');
