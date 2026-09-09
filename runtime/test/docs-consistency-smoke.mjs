import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const root = path.resolve(process.env.EH_DOCS_CONSISTENCY_ROOT || sourceRoot);
const mode = process.argv[2] || 'verify';
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

if (mode === 'red') {
  const expectRejectedMutation = (label, mutate, expected) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), `eh-docs-consistency-${label}-`));
    try {
      fs.cpSync(sourceRoot, fixture, {
        recursive: true,
        filter: (entry) => !['.git', '.codegraph', '.superpowers', 'node_modules', 'dist'].includes(path.basename(entry)),
      });
      mutate(fixture);
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'verify'], {
        cwd: sourceRoot,
        encoding: 'utf-8',
        env: { ...process.env, EH_DOCS_CONSISTENCY_ROOT: fixture },
        shell: false,
      });
      assert.notEqual(result.status, 0, `${label} mutation must fail docs validation`);
      assert.match(`${result.stdout}\n${result.stderr}`, expected);
      console.log(`PASS docs-consistency red negative-mutation (${label} rejected)`);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  };

  expectRejectedMutation('compound-design', (fixture) => {
    const workflowPath = path.join(fixture, 'harness/specs/workflow.md');
    const workflow = fs.readFileSync(workflowPath, 'utf-8').replaceAll('DesignProof', 'BROKEN');
    fs.writeFileSync(workflowPath, workflow);
  }, /compound Design internal sequence|DesignProof/u);

  expectRejectedMutation('readme-positioning', (fixture) => {
    const readmePath = path.join(fixture, 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf-8').replace('acceptance control plane', 'legacy staged workflow');
    fs.writeFileSync(readmePath, readme);
  }, /README must define the acceptance control plane/u);

  expectRejectedMutation('capability-trace', (fixture) => {
    const registryPath = path.join(fixture, 'harness/capabilities.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    delete registry.capabilities[0].userDocRefs;
    fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  }, /userDocRefs/u);

  expectRejectedMutation('marketing-audience', (fixture) => {
    const marketingPath = path.join(fixture, 'docs/marketing/competitive-evidence.md');
    fs.appendFileSync(marketingPath, '\n## 推广时建议\n\n不要使用未经验证的口径。\n');
  }, /public marketing must not contain maintainer-only language/u);

  process.exit(0);
}

function assertUniqueNonEmptyRefs(capability, field, allowed) {
  assert.ok(Array.isArray(capability[field]) && capability[field].length > 0,
    `${capability.id}.${field} must be a non-empty array`);
  assert.equal(new Set(capability[field]).size, capability[field].length,
    `${capability.id}.${field} contains duplicate refs`);
  for (const reference of capability[field]) {
    assert.ok(allowed(reference), `${capability.id}.${field} has an invalid truth-layer ref: ${reference}`);
    assert.ok(fs.existsSync(path.join(root, reference)), `${capability.id}.${field} ref missing: ${reference}`);
  }
}
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

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf-8');
assert.match(readme, /acceptance control plane/u, 'README must define the acceptance control plane');
assert.match(readme, /stale[\s\S]*越权[\s\S]*自我批准[\s\S]*缺少证据/u,
  'README must state the invalid-acceptance product promise');
assert.match(readme, /不能证明绝对更省 token|不能宣传为绝对省 token/u,
  'README must retain the token evidence boundary');
assert.match(readme, /clarify → design → plan → implement → verify → archive/u,
  'README must document the canonical lifecycle');
assert.match(readme, /status → nextAction → pendingDecision → evidence refs/u,
  'README must document the recovery reading order');

const publicMarketingFiles = [
  'docs/marketing/competitive-evidence.md',
  'docs/marketing/announcement.md',
  'docs/marketing/launch-post-kit.md',
];
const maintainerOnlyMarketingLanguage = /禁止口径|不要使用|推广时建议|最稳妥的推广文案|当前 checkout|正式评测应/u;
for (const file of publicMarketingFiles) {
  const text = fs.readFileSync(path.join(root, file), 'utf-8');
  assert.doesNotMatch(text, maintainerOnlyMarketingLanguage,
    `${file}: public marketing must not contain maintainer-only language`);
}
const competitiveEvidence = fs.readFileSync(path.join(root, 'docs/marketing/competitive-evidence.md'), 'utf-8');
assert.match(competitiveEvidence, /交付效果[^。\n]*(?:首要|主指标)|正确产出[^。\n]*(?:首要|主指标)/u,
  'public marketing must make delivery outcomes the primary evaluation criterion');
assert.match(competitiveEvidence, /token[^。\n]*资源指标/u,
  'public marketing must frame token as a resource metric instead of the primary value claim');
assert.match(competitiveEvidence, /model-uplift-hero\.png/u,
  'public marketing must use the generated model-uplift hero visual');
assert.match(competitiveEvidence, /cost_per_accepted_change/u,
  'public marketing must evaluate model economics per accepted change');
const modelUpliftStatus = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/model-uplift-v1/evidence-status.json'), 'utf-8'));
if (!modelUpliftStatus.publishableModelUplift) {
  assert.match(competitiveEvidence, /模型放大效果目前尚未完成可发布验证/u,
    'unproven model uplift must remain explicit on the public evidence page');
  assert.doesNotMatch(competitiveEvidence, /已证明[^。\n]*低价模型[^。\n]*高价模型/u,
    'public marketing must not claim model uplift before the evidence gate passes');
}

const capabilities = JSON.parse(fs.readFileSync(path.join(root, 'harness/capabilities.json'), 'utf-8'));
assert.equal(capabilities.schemaVersion, 2, 'capability registry must use schemaVersion 2');
assert.ok(Array.isArray(capabilities.capabilities) && capabilities.capabilities.length > 0,
  'capability registry must contain capabilities');
const capabilityIds = new Set();
for (const capability of capabilities.capabilities) {
  assert.match(capability.id || '', /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'capability id must be stable kebab-case');
  assert.ok(!capabilityIds.has(capability.id), `duplicate capability id: ${capability.id}`);
  capabilityIds.add(capability.id);
  assert.ok(typeof capability.productClaim === 'string' && /[\u3400-\u9fff]/u.test(capability.productClaim),
    `${capability.id}.productClaim must be a non-empty Chinese user-facing claim`);
  assertUniqueNonEmptyRefs(capability, 'specRefs', (reference) => reference.startsWith('harness/specs/') && reference.endsWith('.md'));
  assertUniqueNonEmptyRefs(capability, 'implementationRefs', (reference) => /^(?:runtime|skills|agents|hooks|bin|harness\/plugin)\//u.test(reference));
  assertUniqueNonEmptyRefs(capability, 'testRefs', (reference) => /^(?:runtime\/test|test)\//u.test(reference));
  assertUniqueNonEmptyRefs(capability, 'userDocRefs', (reference) => reference === 'README.md' || reference.startsWith('docs/user/'));
  assertUniqueNonEmptyRefs(capability, 'maintainerDocRefs', (reference) => reference.startsWith('docs/maintainer/'));
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
