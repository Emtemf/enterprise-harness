import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../..', import.meta.url);
const settings = JSON.parse(fs.readFileSync(new URL('.claude/settings.json', root), 'utf-8'));
assert.deepEqual(settings.worktree, { baseRef: 'head' });
console.log('PASS native-worktree-config verify');
