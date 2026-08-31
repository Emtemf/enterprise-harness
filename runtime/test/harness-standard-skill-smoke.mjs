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
  const research = read('skills/harness/references/clarify-research.md');
  const decisions = read('skills/harness/references/clarify-decisions.md');
  const completion = read('skills/harness/references/clarify-completion.md');
  for (const [body, headings] of [
    [research, ['## Phase 0：进入 Clarify', '## Phase 1：完成事实探索']],
    [decisions, ['## Phase 2：综合事实并建立 topology', '## Phase 3：只澄清 Decisions']],
    [completion, ['## Phase 4：确认并完成 Clarify', '## Phase 5：后续阶段与恢复']],
  ]) for (const heading of headings) assert.ok(body.includes(heading), `phase reference must include ${heading}`);

  const corpus = [skill, research, decisions, completion].join('\n');
  for (const behavior of [
    'design tree',
    'ResearchPacket',
    '等待全部 required lanes',
    'Decisions',
    'AskUserQuestion',
    '重新计算',
    'Fast Path',
    '不得进入 Design',
  ]) assert.ok(corpus.includes(behavior), `harness controller/reference set must make ${behavior} executable`);
  assert.ok(
    skill.includes('node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" workflow status <change-id> --json'),
    'controller must record the exact plugin-root workflow status argv',
  );
  assert.ok(skill.includes('不要把它改写成 `npx`、全局 `enterprise-harness` 命令或自造 wrapper'), 'controller must forbid guessed CLI wrappers');
  for (const forbiddenSuffix of ['`2>&1`', '`| head`', '`| tail`']) {
    assert.ok(skill.includes(forbiddenSuffix), `controller must forbid shell suffix ${forbiddenSuffix}`);
  }
  assert.ok(research.includes('不得追加 `2>&1`、pipe、`head`、`tail`'), 'research commands must terminate at their documented argv');
  assert.ok(skill.includes('node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify status <change-id> --json'));
  assert.ok(skill.includes('node "${CLAUDE_PLUGIN_ROOT}/runtime/cli.mjs" clarify recover <change-id>'));
  assert.equal(/^## Phase [0-5]/gmu.test(skill), false, 'auto-loaded controller must not retain phase procedure detail');
}

function assertRequirementsTemplate() {
  const template = read('skills/harness/assets/requirements.md.tmpl');
  for (const field of [
    '分数（0-5）',
    'Gap / unresolved decision',
    'Gap type',
    'Owner / status',
    '上轮分数',
    '本轮分数',
    '用户确认 / 修正',
    'Evidence ledger',
    'Predicate coverage',
    'Evidence refs',
    'Authentication decision surfaces',
  ]) assert.ok(template.includes(field), `requirements template must persist ${field}`);
  assert.ok(template.includes('Options / recommendation'), 'requirements template must persist decision alternatives and recommendation');
}

function assertBehavioralEvals() {
  const evals = JSON.parse(read('test/skill-evals/harness/evals.json'));
  assert.equal(evals.skill, 'harness');
  assert.ok(Array.isArray(evals.cases) && evals.cases.length >= 5, 'harness must define at least five eval cases');
  const ids = new Set(evals.cases.map((entry) => entry.id));
  for (const id of [
    'multi-component-topology',
    'brownfield-fact-first',
    'weakest-frontier-one-question',
    'fast-path',
    'approval-gate',
    'fact-lanes-before-interview',
    'lane-ledger-before-research-dispatch',
    'lane-ledger-stale-revision-recovery',
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

function assertProductionSkillHasNoProvenanceNarration() {
  const skill = read('skills/harness/SKILL.md');
  assert.doesNotMatch(skill, /Grill Me|Deep Interview|Superpowers Brainstorming/u);
  assert.equal(fs.existsSync(path.join(root, 'skills/harness/evals')), false);
}

try {
  assertHarnessInstructions();
  assertRequirementsTemplate();
  assertBehavioralEvals();
  assertUpstreamTraceability();
  assertProductionSkillHasNoProvenanceNarration();
  console.log(`PASS harness-standard-skill ${mode}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
