import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2];
if (!['red', 'green', 'verify'].includes(mode)) process.exit(2);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');

function assertHarnessInstructions() {
  const skill = read('skills/harness/SKILL.md');
  for (const heading of [
    '## 进入 Clarify',
    '## Clarify 执行循环',
    '## Clarify 完成门禁',
    '## 恢复与阻断',
  ]) assert.ok(skill.includes(heading), `harness skill must include ${heading}`);

  for (const behavior of [
    'design tree',
    'Round 0',
    'weakest / highest-risk',
    'Facts',
    'Decisions',
    'AskUserQuestion',
    '重新计算',
    'Fast Path',
    '不得进入 Design',
  ]) assert.ok(skill.includes(behavior), `harness skill must make ${behavior} executable`);
}

function assertRequirementsTemplate() {
  const template = read('skills/harness/assets/requirements.md.tmpl');
  for (const field of [
    '分数（0-5）',
    '评分依据',
    'Gap / unresolved decision',
    'Gap type',
    'Owner / status',
    '上轮分数',
    '本轮分数',
    '用户确认 / 修正',
  ]) assert.ok(template.includes(field), `requirements template must persist ${field}`);
  assert.ok(template.includes('Options / recommendation'), 'requirements template must persist decision alternatives and recommendation');
}

function assertBehavioralEvals() {
  const evals = JSON.parse(read('skills/harness/evals/evals.json'));
  assert.equal(evals.skill, 'harness');
  assert.ok(Array.isArray(evals.cases) && evals.cases.length >= 5, 'harness must define at least five eval cases');
  const ids = new Set(evals.cases.map((entry) => entry.id));
  for (const id of [
    'multi-component-topology',
    'brownfield-fact-first',
    'weakest-frontier-one-question',
    'fast-path',
    'approval-gate',
  ]) assert.ok(ids.has(id), `harness evals must cover ${id}`);
  for (const entry of evals.cases) {
    assert.ok(entry.prompt, `${entry.id} must include a pressure prompt`);
    assert.ok(Array.isArray(entry.assertions) && entry.assertions.length > 0, `${entry.id} must include behavioral assertions`);
    assert.ok(Array.isArray(entry.forbidden) && entry.forbidden.length > 0, `${entry.id} must include forbidden behavior`);
  }
}

function assertUpstreamTraceability() {
  const registry = JSON.parse(read('harness/upstream/registry.json'));
  const byName = new Map(registry.referenceUpstreams.map((entry) => [entry.name, entry]));
  for (const name of ['Grill Me', 'deep-interview', 'Superpowers']) {
    const entry = byName.get(name);
    assert.ok(entry, `upstream registry must include ${name}`);
    assert.match(entry.reviewedCommit ?? '', /^[0-9a-f]{40}$/u, `${name} must pin the reviewed commit`);
  }
  const mapping = read('harness/specs/upstream-mapping.md');
  assert.ok(mapping.includes('clarify → design → plan → implement → verify → archive'));
  assert.equal(mapping.includes('clarify → route → design → plan → tdd → verify → archive'), false);
}

try {
  assertHarnessInstructions();
  assertRequirementsTemplate();
  assertBehavioralEvals();
  assertUpstreamTraceability();
  console.log(`PASS harness-standard-skill ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
