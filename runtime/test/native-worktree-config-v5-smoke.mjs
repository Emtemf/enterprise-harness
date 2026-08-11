import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const settings = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf-8'));
assert.deepEqual(settings.worktree, { baseRef: 'head' });
console.log('PASS native-worktree-config verify');
