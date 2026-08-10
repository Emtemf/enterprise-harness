import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const files = [
  '.claude/skills/harness/SKILL.md',
  '.claude/rules/10-exploration.md',
  '.claude/agents/code-explore.md',
  'docs/user/troubleshooting.md',
];
const corpus = files.map(read).join('\n');
const checks = () => {
  assert.ok(corpus.includes('enterprise-harness:code-explore'));
  assert.ok(corpus.includes('CodeGraph-first') || corpus.includes('codegraph-first'));
  assert.match(corpus, /主 orchestrator[\s\S]{0,80}(?:不重复|不得.*重复)/u);
  assert.match(corpus, /当前用户|目标项目|真实工作区/u);
  assert.ok(read('.claude/skills/harness/SKILL.md').includes('executor 与 checker 必须是不同 subagent/run'));
  assert.ok(read('.claude/skills/harness/SKILL.md').includes('worktree 只提供文件隔离；subagent 提供上下文隔离'));
  assert.doesNotMatch(corpus, /subagent_type:\s*`?code-explore`?/u);
};
try {
  checks();
  if (mode === 'red') {
    console.error('RED precondition no longer holds');
    process.exit(1);
  }
  console.log(`PASS subagent-contract ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(mode === 'red' ? 0 : 1);
}
