import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const files = ['skills/harness/SKILL.md', 'skills/explore-code/SKILL.md', 'agents/code-explore.md', 'docs/user/troubleshooting.md'];
const corpus = files.map(read).join('\n');
const checks = () => {
  assert.ok(corpus.includes('enterprise-harness:code-explore'));
  assert.ok(corpus.includes('CodeGraph-first') || corpus.includes('codegraph-first'));
  assert.match(read('skills/harness/SKILL.md'), /不得重复 worker 已完成的探索/u);
  assert.match(read('skills/harness/SKILL.md'), /每次仅用.*一个.*用户问题/u);
  assert.match(read('skills/harness/SKILL.md'), /原生 worktree[\s\S]*独立 reviewer/u);
  assert.doesNotMatch(corpus, /subagent_type:\s*`?code-explore`?/u);
};
try {
  checks();
  if (mode === 'red') process.exit(1);
  console.log(`PASS subagent-contract ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(mode === 'red' ? 0 : 1);
}
