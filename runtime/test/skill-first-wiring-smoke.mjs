import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = fileURLToPath(new URL('../../', import.meta.url));
const skills = {
  'explore-code': 'enterprise-harness:code-explore',
  'research-docs': 'enterprise-harness:doc-research',
  design: 'enterprise-harness:artifact-worker',
  'test-design': 'enterprise-harness:test-design-worker',
  plan: 'enterprise-harness:artifact-worker',
  implement: 'enterprise-harness:implementer',
  review: 'enterprise-harness:reviewer',
  verify: 'enterprise-harness:artifact-worker',
  archive: 'enterprise-harness:artifact-worker',
};

const failures = [];
for (const [skill, agent] of Object.entries(skills)) {
  const source = fs.readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
  if (!source.includes('context: fork')) failures.push(`${skill} must fork context`);
  if (!source.includes(`agent: ${agent}`)) failures.push(`${skill} must bind ${agent}`);
  if (/^background:/mu.test(source)) failures.push(`${skill} must not use agent-only background frontmatter`);
}

const explore = fs.readFileSync(path.join(root, 'agents', 'code-explore.md'), 'utf8');
if (explore.includes('  - Bash')) failures.push('code-explore must not expose Bash');
for (const tool of ['  - Grep', '  - Glob', '  - ToolSearch']) {
  if (!explore.includes(tool)) failures.push(`code-explore must expose ${tool.trim()}`);
}

const docs = fs.readFileSync(path.join(root, 'agents', 'doc-research.md'), 'utf8');
if (docs.includes('  - Bash')) failures.push('doc-research must not expose Bash');
for (const tool of ['  - Read', '  - WebFetch', '  - WebSearch', '  - ToolSearch', '  - mcp__context7__resolve-library-id', '  - mcp__context7__query-docs']) {
  if (!docs.includes(tool)) failures.push(`doc-research must expose ${tool.trim()}`);
}
if (/^skills:\s*$/mu.test(explore) || /^skills:\s*$/mu.test(docs)) failures.push('research agents must not carry empty skills frontmatter');

for (const skill of ['design', 'review']) {
  const source = fs.readFileSync(path.join(root, 'skills', skill, 'SKILL.md'), 'utf8');
  if (!source.includes('${CLAUDE_SKILL_DIR}')) failures.push(`${skill} must resolve bundled files from CLAUDE_SKILL_DIR`);
}

const requiredAssets = [
  ['skills/harness/scripts/finalize-clarify-result.mjs', 'clarify finalizer'],
  ['skills/implement/scripts/finalize-result.mjs', 'implement finalizer'],
  ['runtime/lib/task-execution-receipt.mjs', 'task receipt validator'],
  ['runtime/lib/hook-health.mjs', 'hook health policy'],
];
for (const [relativePath, label] of requiredAssets) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`${label} is unreachable: ${relativePath}`);
}
const sessionStart = fs.readFileSync(path.join(root, 'hooks', 'scripts', 'session-start.mjs'), 'utf8');
if (!sessionStart.includes('recordHookHealth')) failures.push('SessionStart must record hook health');
if (mode === 'red') {
  assert.ok(failures.length > 0, 'target wiring is already complete; update this test for the next contract');
  console.log(`RED skill-first wiring: ${failures.join('; ')}`);
} else {
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`PASS skill-first wiring ${mode}`);
}
