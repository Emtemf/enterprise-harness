import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);
const normalizedRoot = path.resolve(root);
const walkMarkdown = (relative) => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [relative];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name).split(path.sep).join('/');
    if (entry.isDirectory()) return walkMarkdown(child);
    return entry.name.endsWith('.md') ? [child] : [];
  });
};
const docs = [
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  ...walkMarkdown('docs/user'),
  ...walkMarkdown('docs/maintainer').filter((file) => !file.includes('/lessons/')),
  ...walkMarkdown('docs/marketing'),
  ...walkMarkdown('docs/adr'),
  ...walkMarkdown('harness/specs'),
];
const stale = /(?:docs\/zh-cn|harness\/explorations|PROGRESS\.md|plugin-runtime\.md|session-lifecycle\.md|staged-workflow\.md)/u;
for (const file of new Set(docs)) {
  const text = fs.readFileSync(path.join(root, file), 'utf-8');
  assert.doesNotMatch(text, stale, `${file} contains a stale truth-source reference`);
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:https?:|mailto:)/u.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.join(root, file)), decodeURIComponent(target));
    assert.ok(resolved === normalizedRoot || resolved.startsWith(normalizedRoot + path.sep), `${file} link escapes repository: ${target}`);
    assert.ok(fs.existsSync(resolved), `${file} has broken link: ${target}`);
  }
}

const plugin = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/plugin.json'), 'utf-8'));
for (const target of [...plugin.skills, ...plugin.agents]) {
  assert.ok(fs.existsSync(path.resolve(root, target)), `plugin manifest target missing: ${target}`);
}

const runtimeCodes = new Set();
const runtimeRoot = path.join(root, 'runtime');
for (const relative of fs.readdirSync(runtimeRoot, { recursive: true, encoding: 'utf-8' })) {
  if (!String(relative).endsWith('.mjs') || String(relative).startsWith(`test${path.sep}`)) continue;
  const text = fs.readFileSync(path.join(runtimeRoot, relative), 'utf-8');
  for (const match of text.matchAll(/EH-[A-Z0-9-]+/gu)) runtimeCodes.add(match[0]);
}
for (const relative of fs.readdirSync(path.join(root, 'bin'), { recursive: true, encoding: 'utf-8' })) {
  if (!String(relative).endsWith('.mjs')) continue;
  const text = fs.readFileSync(path.join(root, 'bin', relative), 'utf-8');
  for (const match of text.matchAll(/EH-[A-Z0-9-]+/gu)) runtimeCodes.add(match[0]);
}
const troubleshooting = fs.readFileSync(path.join(root, 'docs/user/troubleshooting.md'), 'utf-8');
for (const code of runtimeCodes) assert.ok(troubleshooting.includes(code), `troubleshooting missing ${code}`);

const architecture = fs.readFileSync(path.join(root, 'harness/specs/architecture.md'), 'utf-8');
const workflowSpec = fs.readFileSync(path.join(root, 'harness/specs/workflow.md'), 'utf-8');
const workflowDocs = fs.readFileSync(path.join(root, 'docs/user/workflow.md'), 'utf-8');
const observability = fs.readFileSync(path.join(root, 'harness/specs/stage-observability.md'), 'utf-8');
const runtimeSequence = fs.readFileSync(path.join(root, 'docs/maintainer/runtime-sequence.md'), 'utf-8');
assert.match(architecture, /Claude Code-only[\s\S]*不设计或承诺[\s\S]*其他 harness/u, 'architecture must define the Claude Code-only host boundary');
for (const [name, text] of [['user workflow', workflowDocs], ['stage observability', observability]]) {
  assert.match(text, /status=blocked/u, `${name} must document audit-first blocked status`);
  assert.match(text, /nextAction/u, `${name} must document nextAction as the blocked recovery authority`);
  assert.match(text, /pendingDecision/u, `${name} must distinguish pending decisions from blocked recovery`);
}
assert.match(workflowSpec, /architecture.*execute[\s\S]*architecture.*review[\s\S]*seal[\s\S]*test-design.*execute[\s\S]*test-design.*review[\s\S]*DesignProof/iu,
  'workflow contract must define the compound Design internal sequence');
assert.match(workflowSpec, /test-cases\.md[\s\S]*independent authoritative/iu,
  'workflow contract must make independent test-cases authoritative for detailed cases');
assert.match(workflowDocs, /test-design[\s\S]*test-cases\.md/iu,
  'user workflow must explain the independent test-design artifact');
assert.doesNotMatch(workflowDocs, /Design[\s\S]{0,100}完整测试用例/u,
  'user workflow must not claim Design owns detailed test cases');
assert.match(runtimeSequence, /architecture[\s\S]*seal[\s\S]*test-design[\s\S]*DesignProof/iu,
  'maintainer sequence must show the exact Design internal ordering');

const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'harness/capabilities.json'), 'utf-8'));
for (const capability of capabilities.capabilities) {
  assert.ok(capability.testRefs.length > 0, `${capability.id} has no acceptance test`);
  for (const testRef of capability.testRefs) {
    assert.ok(fs.existsSync(path.join(root, testRef)), `${capability.id} test missing: ${testRef}`);
  }
}
for (const spec of walkMarkdown('harness/specs').filter((file) => path.basename(file) !== 'README.md')) {
  const text = fs.readFileSync(path.join(root, spec), 'utf-8');
  for (const field of ['status', 'owner', 'lastVerified', 'implementationRefs', 'testRefs']) {
    assert.match(text, new RegExp(`^${field}:`, 'm'), `${spec} metadata missing ${field}`);
  }
  const frontmatter = text.split('---')[1] || '';
  for (const match of frontmatter.matchAll(/^\s+-\s+(.+)$/gmu)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `${spec} metadata ref missing: ${match[1]}`);
  }
}
const cliReference = spawnSync(process.execPath, ['bin/generate-cli-reference.mjs', '--check'], {
  cwd: root,
  encoding: 'utf-8',
  shell: false,
});
assert.equal(cliReference.status, 0, cliReference.stderr || cliReference.stdout);
console.log(`PASS docs-consistency ${mode}`);
