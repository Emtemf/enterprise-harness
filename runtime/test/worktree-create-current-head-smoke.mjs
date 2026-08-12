import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mode = process.argv[2] || 'verify';
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'harness/plugin/hooks-manifest.json'), 'utf-8'));
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf-8'));
const packaged = JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf-8'));

for (const [label, hooks] of [
  ['source', sourceManifest.hooks],
  ['settings', settings.hooks],
  ['package', packaged.hooks],
]) {
  assert.equal(Object.hasOwn(hooks, 'WorktreeCreate'), false, `${label} must use native WorktreeCreate`);
  assert.equal(Object.hasOwn(hooks, 'WorktreeRemove'), false, `${label} must use native WorktreeRemove`);
}
assert.equal(fs.existsSync(path.join(root, 'runtime/hooks/worktree-create.mjs')), false);
assert.equal(fs.existsSync(path.join(root, 'runtime/hooks/worktree-remove.mjs')), false);
assert.deepEqual(settings.worktree, { baseRef: 'head' });
console.log(`PASS native-worktree ${mode}`);
