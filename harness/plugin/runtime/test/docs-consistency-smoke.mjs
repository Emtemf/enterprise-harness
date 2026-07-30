import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const normalizedRoot = path.resolve(root);
const walkMarkdown = (relative) => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  if (fs.statSync(absolute).isFile()) return [relative];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
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
const runtimeRoot = path.join(root, 'harness/plugin/runtime');
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

const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'harness/capabilities.json'), 'utf-8'));
for (const capability of capabilities.capabilities) {
  assert.ok(capability.testRefs.length > 0, `${capability.id} has no acceptance test`);
  for (const testRef of capability.testRefs) {
    assert.ok(fs.existsSync(path.join(root, testRef)), `${capability.id} test missing: ${testRef}`);
  }
}
for (const spec of walkMarkdown('harness/specs').filter((file) => !file.endsWith('/README.md'))) {
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
console.log('PASS docs-consistency verify');
